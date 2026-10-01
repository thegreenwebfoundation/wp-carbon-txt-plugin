<?php
/**
 * Renders the stored setting into a carbon.txt (TOML) string.
 *
 * @package WpCarbonTxt
 */

namespace WpCarbonTxt;

defined( 'ABSPATH' ) || exit;

/**
 * Carbon.txt renderer.
 */
class Renderer {

	/**
	 * Build the carbon.txt file body from the stored setting.
	 *
	 * @return string
	 */
	public static function render() {
		// The stored option is normalized on read by Settings.
		$settings    = get_option( OPTION_NAME, array() );
		$disclosures = isset( $settings['disclosures'] ) ? (array) $settings['disclosures'] : array();
		$schemes     = isset( $settings['certification_schemes'] ) ? (array) $settings['certification_schemes'] : array();

		$entries = array();
		foreach ( $disclosures as $disclosure ) {
			$url = isset( $disclosure['url'] ) ? trim( (string) $disclosure['url'] ) : '';
			if ( '' === $url ) {
				continue;
			}
			$entries[] = self::render_disclosure( $disclosure, $url );
		}

		// Stamp dates come from the option (set at save time by Settings) so
		// the cached file stays byte-stable between saves; the fallback only
		// covers options saved before this field existed.
		$last_updated = isset( $settings['last_updated'] ) && '' !== $settings['last_updated']
			? $settings['last_updated']
			: gmdate( 'Y-m-d' );

		$lines   = array();
		$lines[] = 'version = "' . Settings::latest_version() . '"';
		$lines[] = 'last_updated = ' . self::toml_date( $last_updated );
		$lines[] = '';
		$lines[] = '[org]';

		if ( ! empty( $schemes ) ) {
			$lines[] = 'certification_schemes = [';
			foreach ( self::render_schemes( $schemes ) as $scheme ) {
				$lines[] = '    ' . $scheme . ',';
			}
			$lines[] = ']';
		}

		if ( empty( $entries ) ) {
			$lines[] = 'disclosures = []';
		} else {
			$lines[] = 'disclosures = [';
			foreach ( $entries as $entry ) {
				$lines[] = '    ' . $entry . ',';
			}
			$lines[] = ']';
		}

		return implode( "\n", $lines ) . "\n";
	}

	/**
	 * Render the org-level certification schemes as TOML inline tables.
	 *
	 * @param array $schemes Scheme list.
	 * @return string[]
	 */
	private static function render_schemes( $schemes ) {
		$entries = array();

		foreach ( $schemes as $scheme ) {
			$id = isset( $scheme['id'] ) ? trim( (string) $scheme['id'] ) : '';
			if ( '' === $id ) {
				continue;
			}

			$pairs   = array();
			$pairs[] = 'id = ' . self::toml_string( $id );
			$pairs[] = 'url = ' . self::toml_string( isset( $scheme['url'] ) ? trim( (string) $scheme['url'] ) : '' );

			if ( ! empty( $scheme['title'] ) ) {
				$pairs[] = 'title = ' . self::toml_string( $scheme['title'] );
			}
			if ( ! empty( $scheme['description'] ) ) {
				$pairs[] = 'description = ' . self::toml_string( $scheme['description'] );
			}

			$entries[] = '{ ' . implode( ', ', $pairs ) . ' }';
		}

		return $entries;
	}

	/**
	 * Render a single disclosure as a TOML inline table.
	 *
	 * @param array  $disclosure Disclosure data.
	 * @param string $url        Trimmed URL (already validated as non-empty).
	 * @return string
	 */
	private static function render_disclosure( $disclosure, $url ) {
		$doc_type = ( isset( $disclosure['doc_type'] ) && '' !== $disclosure['doc_type'] )
			? $disclosure['doc_type']
			: 'web-page';

		$pairs   = array();
		$pairs[] = 'doc_type = ' . self::toml_string( $doc_type );
		$pairs[] = 'url = ' . self::toml_string( $url );

		if ( ! empty( $disclosure['title'] ) ) {
			$pairs[] = 'title = ' . self::toml_string( $disclosure['title'] );
		}
		if ( ! empty( $disclosure['description'] ) ) {
			$pairs[] = 'description = ' . self::toml_string( $disclosure['description'] );
		}
		if ( ! empty( $disclosure['valid_until'] ) ) {
			$pairs[] = 'valid_until = ' . self::toml_date( $disclosure['valid_until'] );
		}
		if ( ! empty( $disclosure['domain'] ) ) {
			$pairs[] = 'domain = ' . self::toml_string( $disclosure['domain'] );
		}
		if ( ! empty( $disclosure['certification_schemes'] ) ) {
			$refs    = array_map( array( self::class, 'toml_string' ), array_values( (array) $disclosure['certification_schemes'] ) );
			$pairs[] = 'certification_schemes = [ ' . implode( ', ', $refs ) . ' ]';
		}

		return '{ ' . implode( ', ', $pairs ) . ' }';
	}

	/**
	 * Encode a value as a TOML basic string.
	 *
	 * @param string $value Value.
	 * @return string
	 */
	private static function toml_string( $value ) {
		$escaped = str_replace(
			array( '\\', '"' ),
			array( '\\\\', '\\"' ),
			(string) $value
		);

		// Control characters (line breaks above all) would terminate a
		// single-line basic string and make the file invalid TOML; TOML 1.0
		// only allows them escaped.
		$escaped = preg_replace_callback(
			'/[\x00-\x1F\x7F]/',
			static function ( $m ) {
				$named = array(
					"\x08" => '\b',
					"\x09" => '\t',
					"\x0A" => '\n',
					"\x0C" => '\f',
					"\x0D" => '\r',
				);
				if ( isset( $named[ $m[0] ] ) ) {
					return $named[ $m[0] ];
				}
				return sprintf( '\u%04X', ord( $m[0] ) );
			},
			$escaped
		);

		return '"' . $escaped . '"';
	}

	/**
	 * Encode a date. A plain YYYY-MM-DD becomes a native TOML local date;
	 * anything else falls back to a quoted string.
	 *
	 * @param string $value Value.
	 * @return string
	 */
	private static function toml_date( $value ) {
		$value = trim( (string) $value );

		if ( preg_match( '/^\d{4}-\d{2}-\d{2}$/', $value ) ) {
			return $value;
		}

		return self::toml_string( $value );
	}
}
