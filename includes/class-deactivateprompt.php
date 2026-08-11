<?php
/**
 * Offers to export the disclosures before the plugin is deactivated.
 *
 * The plugin's own admin_notices/deactivation hooks can't render UI at the
 * moment of deactivation (the request redirects without a page render), but
 * the Plugins screen itself still runs while the plugin is active — so the
 * "Deactivate" link is intercepted there instead.
 *
 * @package WpCarbonTxt
 */

namespace WpCarbonTxt;

defined( 'ABSPATH' ) || exit;

/**
 * Deactivation export prompt on the Plugins screen.
 */
class DeactivatePrompt {

	/**
	 * Hook registration.
	 */
	public static function init() {
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueue' ) );
	}

	/**
	 * On the Plugins screen only, and only when there is something worth
	 * keeping, load the intercept modal.
	 *
	 * @param string $hook Current admin page hook.
	 */
	public static function enqueue( $hook ) {
		if ( 'plugins.php' !== $hook || ! self::has_disclosures() ) {
			return;
		}

		$base = plugin_dir_url( __DIR__ );
		$path = plugin_dir_path( __DIR__ );

		wp_enqueue_style(
			'wp-carbon-txt-deactivate',
			$base . 'assets/deactivate.css',
			array(),
			filemtime( $path . 'assets/deactivate.css' )
		);

		wp_enqueue_script(
			'wp-carbon-txt-deactivate',
			$base . 'assets/deactivate.js',
			array(),
			filemtime( $path . 'assets/deactivate.js' ),
			true
		);

		wp_localize_script(
			'wp-carbon-txt-deactivate',
			'wpCarbonTxtDeactivate',
			array(
				'pluginFile' => plugin_basename( PLUGIN_FILE ),
				'content'    => Renderer::render(),
				'i18n'       => array(
					'title'      => __( 'Keep a copy of your disclosures', 'wp-carbon-txt-plugin' ),
					'message'    => __( 'Removing this plugin also removes its saved settings. Save a copy of your current disclosures if you ever plan to deactivate or delete it.', 'wp-carbon-txt-plugin' ),
					'copy'       => __( 'Copy to clipboard', 'wp-carbon-txt-plugin' ),
					'copied'     => __( 'Copied!', 'wp-carbon-txt-plugin' ),
					'download'   => __( 'Download file', 'wp-carbon-txt-plugin' ),
					'deactivate' => __( 'Deactivate', 'wp-carbon-txt-plugin' ),
					'cancel'     => __( 'Cancel', 'wp-carbon-txt-plugin' ),
					'copyError'  => __( 'Could not copy automatically — please select and copy the preview text manually.', 'wp-carbon-txt-plugin' ),
				),
			)
		);
	}

	/**
	 * Whether at least one saved disclosure has a URL — i.e. the exported
	 * file would contain something worth keeping.
	 *
	 * @return bool
	 */
	private static function has_disclosures() {
		$settings    = get_option( OPTION_NAME, array() );
		$disclosures = isset( $settings['disclosures'] ) ? (array) $settings['disclosures'] : array();

		foreach ( $disclosures as $disclosure ) {
			if ( ! empty( $disclosure['url'] ) && '' !== trim( (string) $disclosure['url'] ) ) {
				return true;
			}
		}

		return false;
	}
}
