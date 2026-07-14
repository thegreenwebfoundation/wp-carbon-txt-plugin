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

		$entries = array();
		foreach ( $disclosures as $disclosure ) {
			$url = isset( $disclosure['url'] ) ? trim( (string) $disclosure['url'] ) : '';
			if ( '' === $url ) {
				continue;
			}
			$entries[] = self::render_disclosure( $disclosure, $url );
		}

		$lines   = array();
		$lines[] = 'version = "' . CARBON_TXT_VERSION . '"';
		$lines[] = '';
		$lines[] = '[org]';

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
		if ( ! empty( $disclosure['valid_until'] ) ) {
			$pairs[] = 'valid_until = ' . self::toml_date( $disclosure['valid_until'] );
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
