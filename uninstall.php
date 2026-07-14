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
delete_transient( 'wp_carbon_txt_rendered' );
