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
		add_action( 'rest_api_init', array( __CLASS__, 'register_rest_routes' ) );
		add_filter(
			'plugin_action_links_' . plugin_basename( PLUGIN_FILE ),
			array( __CLASS__, 'add_action_links' )
		);
	}

	/**
	 * Register this plugin's REST routes: deleting an existing carbon.txt
	 * file found on disk, validating content against the Green Web
	 * Foundation's hosted validator, and storing the API key it requires.
	 * None of these are a plain settings save — they're either a filesystem
	 * action or a proxied external call, both outside the option store.
	 */
	public static function register_rest_routes() {
		register_rest_route(
			'wp-carbon-txt/v1',
			'/existing-file',
			array(
				'methods'             => 'DELETE',
				'callback'            => array( __CLASS__, 'rest_delete_existing_file' ),
				'permission_callback' => static function () {
					return current_user_can( 'manage_options' );
				},
				'args'                => array(
					'location' => array(
						'type'    => 'string',
						'enum'    => array( 'root', 'well_known' ),
						'default' => 'root',
					),
				),
			)
		);

		register_rest_route(
			'wp-carbon-txt/v1',
			'/validate',
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'rest_validate' ),
				'permission_callback' => static function () {
					return current_user_can( 'manage_options' );
				},
				'args'                => array(
					'content' => array(
						'type'              => 'string',
						'required'          => true,
						'validate_callback' => static function ( $value ) {
							return strlen( $value ) <= Importer::MAX_FILE_SIZE;
						},
					),
				),
			)
		);

		register_rest_route(
			'wp-carbon-txt/v1',
			'/api-key',
			array(
				array(
					'methods'             => 'POST',
					'callback'            => array( __CLASS__, 'rest_save_api_key' ),
					'permission_callback' => static function () {
						return current_user_can( 'manage_options' );
					},
					'args'                => array(
						'api_key' => array(
							'type'     => 'string',
							'required' => true,
						),
					),
				),
				array(
					'methods'             => 'DELETE',
					'callback'            => array( __CLASS__, 'rest_delete_api_key' ),
					'permission_callback' => static function () {
						return current_user_can( 'manage_options' );
					},
				),
			)
		);
	}

	/**
	 * REST callback: validate carbon.txt content against the Green Web
	 * Foundation's hosted validator.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public static function rest_validate( $request ) {
		$result = Api_Client::validate_content( $request->get_param( 'content' ) );

		if ( is_wp_error( $result ) ) {
			return $result;
		}

		return rest_ensure_response( $result );
	}

	/**
	 * REST callback: store a new API key. Write-only — the key is never
	 * returned by any REST response, this one included.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response
	 */
	public static function rest_save_api_key( $request ) {
		Api_Key::set( $request->get_param( 'api_key' ) );

		return rest_ensure_response( array( 'configured' => Api_Key::is_configured() ) );
	}

	/**
	 * REST callback: clear the stored API key.
	 *
	 * @return \WP_REST_Response
	 */
	public static function rest_delete_api_key() {
		Api_Key::set( '' );

		return rest_ensure_response( array( 'configured' => false ) );
	}

	/**
	 * REST callback: delete the existing file, at whichever location was
	 * requested.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public static function rest_delete_existing_file( $request ) {
		$result = 'well_known' === $request->get_param( 'location' )
			? Importer::delete_well_known_file()
			: Importer::delete_existing_file();

		if ( is_wp_error( $result ) ) {
			return $result;
		}

		return rest_ensure_response( array( 'deleted' => true ) );
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
		$links[] = sprintf(
			'<a href="%s">%s</a>',
			esc_url( self::settings_url() ),
			esc_html__( 'Settings', 'wp-carbon-txt-plugin' )
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

		// Registers the classic media modal's scripts, used by the file
		// picker without needing @wordpress/block-editor as a dependency.
		wp_enqueue_media();

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
					'carbonTxtVersion' => Settings::latest_version(),
					'existingFile'     => Importer::summary(),
					'wellKnownFile'    => Importer::well_known_summary(),
					'dnsRecord'        => Dns::summary(),
					'apiKeyConfigured' => Api_Key::is_configured(),
				)
			) . ';',
			'before'
		);
	}
}
