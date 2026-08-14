<?php
/**
 * Storage for the Green Web Foundation carbon.txt API key.
 *
 * Kept out of the `wp_carbon_txt_settings` option (and its REST schema) on
 * purpose: that option is meant to be read back into the settings screen,
 * while this is a secret that should only ever flow one way, from the admin
 * screen's write-only field into the option store.
 *
 * @package WpCarbonTxt
 */

namespace WpCarbonTxt;

defined( 'ABSPATH' ) || exit;

/**
 * Green Web Foundation API key storage.
 */
class Api_Key {

	/**
	 * Option name the key is stored under.
	 */
	const OPTION_NAME = 'wp_carbon_txt_api_key';

	/**
	 * Get the stored API key, if any.
	 *
	 * @return string
	 */
	public static function get() {
		return trim( (string) get_option( self::OPTION_NAME, '' ) );
	}

	/**
	 * Whether an API key is currently configured.
	 *
	 * @return bool
	 */
	public static function is_configured() {
		return '' !== self::get();
	}

	/**
	 * Store (or clear) the API key.
	 *
	 * @param string $key New key. An empty string clears it.
	 */
	public static function set( $key ) {
		$key = trim( sanitize_text_field( (string) $key ) );

		if ( '' === $key ) {
			delete_option( self::OPTION_NAME );
			return;
		}

		update_option( self::OPTION_NAME, $key );
	}
}
