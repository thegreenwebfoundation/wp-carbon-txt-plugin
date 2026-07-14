<?php
/**
 * Renders the stored setting into a carbon.txt (TOML) string.
 *
 * @package WpCarbonTxt
 */

namespace WpCarbonTxt;

defined( 'ABSPATH' ) || exit;

/**
 * carbon.txt renderer.
 */
class Renderer {

	/**
	 * Build the carbon.txt file body from the stored setting.
	 *
	 * @return string
	 */
	public static function render() {
		$settings = wp_parse_args( (array) get_option( OPTION_NAME, array() ), Settings::defaults() );

		$lines   = array();
		$lines[] = 'version = "' . CARBON_TXT_VERSION . '"';
		$lines[] = '';
		$lines[] = '[org]';

		$url = trim( (string) $settings['url'] );

		if ( '' === $url ) {
			$lines[] = 'disclosures = []';
		} else {
			$lines[] = 'disclosures = [';
			$lines[] = sprintf(
				'    { doc_type = %s, url = %s },',
				self::toml_string( $settings['doc_type'] ),
				self::toml_string( $url )
			);
			$lines[] = ']';
		}

		return implode( "\n", $lines ) . "\n";
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
}
