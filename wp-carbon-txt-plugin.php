<?php
/**
 * Plugin Name:       WP Carbon.txt
 * Description:        Publish a carbon.txt file with your organisational sustainability disclosures.
 * Version:           0.1.0
 * Requires at least: 6.6
 * Requires PHP:      7.4
 * Author:            Nahuai Badiola
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       wp-carbon-txt-plugin
 *
 * @package WpCarbonTxt
 */

namespace WpCarbonTxt;

defined( 'ABSPATH' ) || exit;

const VERSION      = '0.1.0';
const OPTION_NAME  = 'wp_carbon_txt_settings';
const CACHE_KEY    = 'wp_carbon_txt_rendered';
const CARBON_TXT_VERSION = '0.5';

require_once __DIR__ . '/includes/class-settings.php';
require_once __DIR__ . '/includes/class-renderer.php';
require_once __DIR__ . '/includes/class-endpoint.php';
require_once __DIR__ . '/includes/class-admin.php';

Settings::init();
Endpoint::init();
Admin::init();

// Flush rewrite rules on activation/deactivation so /carbon.txt resolves.
register_activation_hook(
	__FILE__,
	static function () {
		Endpoint::add_rewrite_rule();
		flush_rewrite_rules();
	}
);

register_deactivation_hook(
	__FILE__,
	static function () {
		flush_rewrite_rules();
	}
);
