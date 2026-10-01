<?php
/**
 * Uninstall handler: remove the plugin's stored data.
 *
 * @package WpCarbonTxt
 */

// Exit if accessed directly or not during an uninstall.
if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

delete_option( 'wp_carbon_txt_settings' );
// Legacy: removed when the per-site API key field was replaced by the shared embedded key.
delete_option( 'wp_carbon_txt_api_key' );
delete_transient( 'wp_carbon_txt_rendered' );
