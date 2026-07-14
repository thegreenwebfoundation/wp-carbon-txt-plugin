<?php
/**
 * Registers the settings screen and loads the React admin app.
 *
 * @package WpCarbonTxt
 */

namespace WpCarbonTxt;

defined( 'ABSPATH' ) || exit;

/**
 * Admin settings page.
 */
class Admin {

	/**
	 * Admin page slug.
	 */
	const SLUG = 'wp-carbon-txt';

	/**
	 * Hook registration.
	 */
	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'add_menu' ) );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueue' ) );
	}

	/**
	 * Add the settings submenu under Settings.
	 */
	public static function add_menu() {
		add_options_page(
			__( 'Carbon.txt', 'wp-carbon-txt-plugin' ),
			__( 'Carbon.txt', 'wp-carbon-txt-plugin' ),
			'manage_options',
			self::SLUG,
			array( __CLASS__, 'render_root' )
		);
	}

	/**
	 * Mount point for the React app.
	 */
	public static function render_root() {
		echo '<div class="wrap"><div id="wp-carbon-txt-root"></div></div>';
	}

	/**
	 * Enqueue the built assets on our screen only.
	 *
	 * @param string $hook Current admin page hook.
	 */
	public static function enqueue( $hook ) {
		if ( 'settings_page_' . self::SLUG !== $hook ) {
			return;
		}

		$asset_file = __DIR__ . '/../build/index.asset.php';
		if ( ! file_exists( $asset_file ) ) {
			return;
		}

		$asset    = require $asset_file;
		$base_url = plugin_dir_url( __DIR__ );

		wp_enqueue_script(
			'wp-carbon-txt-admin',
			$base_url . 'build/index.js',
			$asset['dependencies'],
			$asset['version'],
			true
		);

		// Load the core component styles our UI relies on.
		wp_enqueue_style( 'wp-components' );

		wp_set_script_translations(
			'wp-carbon-txt-admin',
			'wp-carbon-txt-plugin',
			plugin_dir_path( __DIR__ ) . 'languages'
		);

		wp_add_inline_script(
			'wp-carbon-txt-admin',
			'window.wpCarbonTxt = ' . wp_json_encode(
				array(
					'optionName'       => OPTION_NAME,
					'docTypes'         => Settings::doc_types(),
					'carbonTxtUrl'     => home_url( '/carbon.txt' ),
					'carbonTxtVersion' => CARBON_TXT_VERSION,
				)
			) . ';',
			'before'
		);
	}
}
