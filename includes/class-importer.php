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
	 * Whether a file exists at the checked path.
	 *
	 * @return bool
	 */
	public static function existing_file_exists() {
		return file_exists( self::file_path() );
	}

	/**
	 * Rename the existing file out of the way, so the web server stops
	 * serving it at /carbon.txt. The original is kept as a timestamped
	 * backup in the same directory rather than deleted, so nothing is lost.
	 *
	 * @return string|\WP_Error The backup path on success.
	 */
	public static function quarantine() {
		$path = self::file_path();

		if ( ! file_exists( $path ) ) {
			return new \WP_Error(
				'wp_carbon_txt_no_file',
				__( 'No existing carbon.txt file was found to rename.', 'wp-carbon-txt-plugin' ),
				array( 'status' => 404 )
			);
		}

		$backup_path = $path . '.' . time() . '.bak';

		if ( ! rename( $path, $backup_path ) ) { // phpcs:ignore WordPress.WP.AlternativeFunctions.rename_rename -- WP_Filesystem's direct method behaves identically here; using it properly would mean also building an FTP-credentials flow for the case it doesn't, which this scoped action doesn't warrant.
			return new \WP_Error(
				'wp_carbon_txt_rename_failed',
				__( 'Could not rename the existing file. Check your server file permissions.', 'wp-carbon-txt-plugin' ),
				array( 'status' => 500 )
			);
		}

		return $backup_path;
	}

	/**
	 * Summarize the existing file for the settings screen: whether it
	 * exists, the path checked, any disclosures we could parse out of it,
	 * and (only when nothing could be parsed) its raw contents to review.
	 *
	 * @return array{exists:bool,path:string,disclosures:array,raw:string}
	 */
	public static function summary() {
		$summary = array(
			'exists'      => false,
			'path'        => self::file_path(),
			'disclosures' => array(),
			'raw'         => '',
		);

		if ( ! self::existing_file_exists() ) {
			return $summary;
		}

		$summary['exists'] = true;

		$size = filesize( self::file_path() );
		if ( false === $size || $size > self::MAX_FILE_SIZE ) {
			return $summary;
		}

		$content = file_get_contents( self::file_path() ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Local read of a small, already size-checked file, not a remote request.
		if ( false === $content ) {
			return $summary;
		}

		$disclosures = self::parse_disclosures( $content );

		if ( $disclosures ) {
			$summary['disclosures'] = $disclosures;
		} else {
			$summary['raw'] = $content;
		}

		return $summary;
	}

	/**
	 * Parse `[org]` disclosures out of raw carbon.txt content.
	 *
	 * @param string $content Raw file content.
	 * @return array
	 */
	private static function parse_disclosures( $content ) {
		$disclosures = self::parse_array_of_tables( $content );

		if ( ! $disclosures ) {
			$disclosures = self::parse_inline_array( $content );
		}

		return $disclosures;
	}

	/**
	 * Parse repeated `[[org.disclosures]]` blocks.
	 *
	 * @param string $content Raw file content.
	 * @return array
	 */
	private static function parse_array_of_tables( $content ) {
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

			$entry = self::extract_disclosure( $block );
			if ( $entry ) {
				$disclosures[] = $entry;
			}
		}

		return $disclosures;
	}

	/**
	 * Parse an inline `disclosures = [ { ... }, { ... } ]` array.
	 *
	 * @param string $content Raw file content.
	 * @return array
	 */
	private static function parse_inline_array( $content ) {
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
				$entry = self::extract_disclosure( $table );
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
	 * @param string $text Block of text containing key = value pairs.
	 * @return array|null Disclosure array, or null if no url was found.
	 */
	private static function extract_disclosure( $text ) {
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

		$entry = array(
			'doc_type' => isset( $pairs['doc_type'] ) ? $pairs['doc_type'] : 'web-page',
			'url'      => $pairs['url'],
		);

		if ( ! empty( $pairs['title'] ) ) {
			$entry['title'] = $pairs['title'];
		}

		if ( ! empty( $pairs['valid_until'] ) ) {
			$entry['valid_until'] = $pairs['valid_until'];
		}

		return $entry;
	}
}
