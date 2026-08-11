<?php
/**
 * Best-effort reader for a pre-existing carbon.txt file on disk.
 *
 * This is not a general-purpose TOML parser — it only recognizes the
 * `[org]` disclosures shape this plugin cares about, in either of the two
 * forms a real-world file is likely to use: an inline array, or repeated
 * `[[org.disclosures]]` array-of-tables blocks. Anything else is left
 * unparsed so the admin can review the raw file instead.
 *
 * @package WpCarbonTxt
 */

namespace WpCarbonTxt;

defined( 'ABSPATH' ) || exit;

/**
 * Existing-file detector and importer.
 */
class Importer {

	/**
	 * Refuse to read files larger than this, to avoid parsing something
	 * unexpectedly huge on every settings page load.
	 */
	const MAX_FILE_SIZE = 262144; // 256 KB.

	/**
	 * Path this plugin checks for a pre-existing file.
	 *
	 * Note: ABSPATH is not always the true public document root (e.g. some
	 * subdirectory installs or proxy setups), so this check can miss a file
	 * that exists elsewhere on the server.
	 *
	 * @return string
	 */
	public static function file_path() {
		return ABSPATH . 'carbon.txt';
	}

	/**
	 * Path checked for a carbon.txt file at the alternate well-known
	 * location. Per the carbon.txt lookup order, this ranks below a file
	 * at the domain root, so it's only ever consulted as a fallback.
	 *
	 * @return string
	 */
	public static function well_known_file_path() {
		return ABSPATH . '.well-known/carbon.txt';
	}

	/**
	 * Permanently delete the file at the domain root, so the web server
	 * stops serving it at /carbon.txt. Deleting rather than renaming aside
	 * is considered safe here specifically because this is only ever
	 * called once the file's disclosures have already been imported into
	 * the plugin's own settings — the data isn't actually at risk.
	 *
	 * @return true|\WP_Error
	 */
	public static function delete_existing_file() {
		return self::delete_file_at( self::file_path() );
	}

	/**
	 * Same as delete_existing_file(), for the file at the well-known
	 * location.
	 *
	 * @return true|\WP_Error
	 */
	public static function delete_well_known_file() {
		return self::delete_file_at( self::well_known_file_path() );
	}

	/**
	 * Permanently delete a file.
	 *
	 * @param string $path Path to the file to delete.
	 * @return true|\WP_Error
	 */
	private static function delete_file_at( $path ) {
		if ( ! file_exists( $path ) ) {
			return new \WP_Error(
				'wp_carbon_txt_no_file',
				__( 'No existing carbon.txt file was found to delete.', 'wp-carbon-txt-plugin' ),
				array( 'status' => 404 )
			);
		}

		if ( ! wp_delete_file_from_directory( $path, dirname( $path ) ) ) {
			return new \WP_Error(
				'wp_carbon_txt_delete_failed',
				__( 'Could not delete the existing file. Check your server file permissions.', 'wp-carbon-txt-plugin' ),
				array( 'status' => 500 )
			);
		}

		return true;
	}

	/**
	 * Summarize the file at the domain root for the settings screen:
	 * whether it exists, the path checked, any disclosures we could parse
	 * out of it, and (only when nothing could be parsed) its raw contents
	 * to review.
	 *
	 * @return array{exists:bool,path:string,disclosures:array,raw:string,file_version:?string,unsupported_version:?string}
	 */
	public static function summary() {
		return self::summary_for_path( self::file_path() );
	}

	/**
	 * Same as summary(), for the file at the well-known location.
	 *
	 * @return array{exists:bool,path:string,disclosures:array,raw:string,file_version:?string,unsupported_version:?string}
	 */
	public static function well_known_summary() {
		return self::summary_for_path( self::well_known_file_path() );
	}

	/**
	 * Build the existing-file summary for a given path.
	 *
	 * @param string $path Path to check.
	 * @return array{exists:bool,path:string,disclosures:array,raw:string,file_version:?string,unsupported_version:?string}
	 */
	private static function summary_for_path( $path ) {
		$summary = array(
			'exists'              => false,
			'path'                => $path,
			'disclosures'         => array(),
			'raw'                 => '',
			'file_version'        => null,
			'unsupported_version' => null,
		);

		if ( ! file_exists( $path ) ) {
			return $summary;
		}

		$summary['exists'] = true;

		$size = filesize( $path );
		if ( false === $size || $size > self::MAX_FILE_SIZE ) {
			return $summary;
		}

		$content = file_get_contents( $path ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Local read of a small, already size-checked file, not a remote request.
		if ( false === $content ) {
			return $summary;
		}

		$file_version            = self::parse_version( $content );
		$summary['file_version'] = $file_version;

		// A file written for a newer spec version than this plugin knows
		// about may use fields or doc_types we can't recognize. Rather than
		// silently drop or downgrade that data, refuse to parse it and let
		// the admin know why — they can update the plugin and re-import.
		if ( $file_version && version_compare( $file_version, Settings::latest_version(), '>' ) ) {
			$summary['raw']                 = $content;
			$summary['unsupported_version'] = $file_version;
			return $summary;
		}

		$disclosures = self::parse_disclosures( $content, $file_version );

		if ( $disclosures ) {
			$summary['disclosures'] = $disclosures;
		} else {
			$summary['raw'] = $content;
		}

		return $summary;
	}

	/**
	 * Extract the top-level `version = "..."` value from raw carbon.txt
	 * content, if present. A file with no version key at all is either
	 * pre-0.2 syntax (unsupported — falls through to the raw-file display
	 * like any other unparseable file) or a 0.2 file omitting the then
	 * optional version key.
	 *
	 * @param string $content Raw file content.
	 * @return string|null
	 */
	private static function parse_version( $content ) {
		if ( preg_match( '/^\s*version\s*=\s*"([^"]*)"/m', $content, $match ) ) {
			return $match[1];
		}
		return null;
	}

	/**
	 * Parse `[org]` disclosures out of raw carbon.txt content.
	 *
	 * @param string      $content Raw file content.
	 * @param string|null $version Spec version declared by the file, if any.
	 * @return array
	 */
	private static function parse_disclosures( $content, $version = null ) {
		$disclosures = self::parse_array_of_tables( $content, $version );

		if ( ! $disclosures ) {
			$disclosures = self::parse_inline_array( $content, $version );
		}

		return $disclosures;
	}

	/**
	 * Parse repeated `[[org.disclosures]]` blocks.
	 *
	 * @param string      $content Raw file content.
	 * @param string|null $version Spec version declared by the file, if any.
	 * @return array
	 */
	private static function parse_array_of_tables( $content, $version = null ) {
		if ( ! preg_match_all( '/\[\[\s*org\.disclosures\s*\]\]/', $content, $headers, PREG_OFFSET_CAPTURE ) ) {
			return array();
		}

		$disclosures = array();
		$count       = count( $headers[0] );

		for ( $i = 0; $i < $count; $i++ ) {
			$start = $headers[0][ $i ][1] + strlen( $headers[0][ $i ][0] );
			$end   = ( $i + 1 < $count ) ? $headers[0][ $i + 1 ][1] : strlen( $content );

			// Stop at the next table header of any kind, in case something
			// else follows before the next [[org.disclosures]] block.
			$block = substr( $content, $start, $end - $start );
			if ( preg_match( '/^\s*\[/m', $block, $next_header, PREG_OFFSET_CAPTURE ) ) {
				$block = substr( $block, 0, $next_header[0][1] );
			}

			$entry = self::extract_disclosure( $block, $version );
			if ( $entry ) {
				$disclosures[] = $entry;
			}
		}

		return $disclosures;
	}

	/**
	 * Parse an inline `disclosures = [ { ... }, { ... } ]` array.
	 *
	 * @param string      $content Raw file content.
	 * @param string|null $version Spec version declared by the file, if any.
	 * @return array
	 */
	private static function parse_inline_array( $content, $version = null ) {
		if ( ! preg_match( '/disclosures\s*=\s*\[/', $content, $match, PREG_OFFSET_CAPTURE ) ) {
			return array();
		}

		$array_body = self::extract_balanced_brackets( $content, $match[0][1] + strlen( $match[0][0] ) - 1 );
		if ( null === $array_body ) {
			return array();
		}

		$disclosures = array();

		if ( preg_match_all( '/\{(.*?)\}/s', $array_body, $tables ) ) {
			foreach ( $tables[1] as $table ) {
				$entry = self::extract_disclosure( $table, $version );
				if ( $entry ) {
					$disclosures[] = $entry;
				}
			}
		}

		return $disclosures;
	}

	/**
	 * Given the index of an opening `[`, return the content between it and
	 * its matching closing `]`, ignoring brackets inside quoted strings.
	 *
	 * @param string $content     Full text.
	 * @param int    $open_index  Index of the opening bracket.
	 * @return string|null
	 */
	private static function extract_balanced_brackets( $content, $open_index ) {
		$length    = strlen( $content );
		$depth     = 0;
		$in_string = false;

		for ( $i = $open_index; $i < $length; $i++ ) {
			$char = $content[ $i ];

			if ( $in_string ) {
				if ( '\\' === $char ) {
					++$i; // Skip the escaped character.
				} elseif ( '"' === $char ) {
					$in_string = false;
				}
				continue;
			}

			if ( '"' === $char ) {
				$in_string = true;
			} elseif ( '[' === $char ) {
				++$depth;
			} elseif ( ']' === $char ) {
				--$depth;
				if ( 0 === $depth ) {
					return substr( $content, $open_index + 1, $i - $open_index - 1 );
				}
			}
		}

		return null;
	}

	/**
	 * Extract the known disclosure fields from a block of `key = value`
	 * pairs (either TOML inline-table body or array-of-tables body).
	 *
	 * @param string      $text    Block of text containing key = value pairs.
	 * @param string|null $version Spec version declared by the file, if any —
	 *                              used to validate doc_type against the enum
	 *                              that was actually valid for that version,
	 *                              rather than always the newest one.
	 * @return array|null Disclosure array, or null if no url was found.
	 */
	private static function extract_disclosure( $text, $version = null ) {
		$pairs = array();

		if ( preg_match_all( '/([A-Za-z_][A-Za-z0-9_]*)\s*=\s*("(?:[^"\\\\]|\\\\.)*"|\d{4}-\d{2}-\d{2})/', $text, $matches, PREG_SET_ORDER ) ) {
			foreach ( $matches as $match ) {
				$key = $match[1];
				$raw = $match[2];

				if ( '"' === $raw[0] ) {
					$value = substr( $raw, 1, -1 );
					$value = str_replace( array( '\\"', '\\\\' ), array( '"', '\\' ), $value );
				} else {
					$value = $raw;
				}

				$pairs[ $key ] = $value;
			}
		}

		if ( empty( $pairs['url'] ) ) {
			return null;
		}

		// The imported file's doc_type isn't guaranteed to match our enum
		// (a different tool or version may use different values); fall
		// back rather than let an invalid value reach the REST schema,
		// which would reject the whole save.
		$doc_type = isset( $pairs['doc_type'] ) ? $pairs['doc_type'] : 'web-page';
		if ( ! in_array( $doc_type, Settings::doc_types( $version ), true ) ) {
			$doc_type = 'web-page';
		}

		$entry = array(
			'doc_type' => $doc_type,
			'url'      => $pairs['url'],
		);

		if ( ! empty( $pairs['title'] ) ) {
			$entry['title'] = $pairs['title'];
		}

		if ( ! empty( $pairs['valid_until'] ) ) {
			$entry['valid_until'] = $pairs['valid_until'];
		}

		if ( ! empty( $pairs['domain'] ) ) {
			$entry['domain'] = $pairs['domain'];
		}

		return $entry;
	}
}
