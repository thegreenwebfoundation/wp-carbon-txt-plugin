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
	 * Transient flagging a pending post-activation redirect.
	 */
	const ACTIVATION_REDIRECT_FLAG = 'wp_carbon_txt_activation_redirect';

	/**
	 * Hook registration.
	 */
	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'add_menu' ) );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueue' ) );
		add_action( 'admin_init', array( __CLASS__, 'maybe_redirect_after_activation' ) );
		add_filter(
			'plugin_action_links_' . plugin_basename( PLUGIN_FILE ),
			array( __CLASS__, 'add_action_links' )
		);
	}

	/**
	 * URL of the settings screen.
	 *
	 * @return string
	 */
	public static function settings_url() {
		return admin_url( 'options-general.php?page=' . self::SLUG );
	}

	/**
	 * Flag that the plugin was just activated, for a one-time redirect.
	 *
	 * Called from the activation hook.
	 */
	public static function schedule_activation_redirect() {
		set_transient( self::ACTIVATION_REDIRECT_FLAG, true, 30 );
	}

	/**
	 * Send the user to the settings screen right after activating the
	 * plugin on its own — but not when it was part of a bulk activation,
	 * a network activation, or a non-interactive request.
	 */
	public static function maybe_redirect_after_activation() {
		if ( ! get_transient( self::ACTIVATION_REDIRECT_FLAG ) ) {
			return;
		}

		delete_transient( self::ACTIVATION_REDIRECT_FLAG );

		$is_bulk_activation = isset( $_GET['activate-multi'] ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Presence check only, no data is processed.

		if (
			$is_bulk_activation
			|| ( is_multisite() && is_network_admin() )
			|| wp_doing_ajax()
			|| ( defined( 'WP_CLI' ) && WP_CLI )
		) {
			return;
		}

		wp_safe_redirect( self::settings_url() );
		exit;
	}

	/**
	 * Add a "Settings" link to the plugin's row on the Plugins screen.
	 *
	 * @param string[] $links Existing action links.
	 * @return string[]
	 */
	public static function add_action_links( $links ) {
		array_unshift(
			$links,
			sprintf(
				'<a href="%s">%s</a>',
				esc_url( self::settings_url() ),
				esc_html__( 'Settings', 'wp-carbon-txt-plugin' )
			)
		);

		return $links;
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
