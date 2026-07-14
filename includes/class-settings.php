<?php
/**
 * Registers the plugin setting and exposes it to the REST API.
 *
 * @package WpCarbonTxt
 */

namespace WpCarbonTxt;

defined( 'ABSPATH' ) || exit;

/**
 * Setting registration.
 */
class Settings {

	/**
	 * Valid carbon.txt disclosure document types (spec v0.5).
	 *
	 * @return string[]
	 */
	public static function doc_types() {
		return array(
			'web-page',
			'annual-report',
			'sustainability-page',
			'certificate',
			'csrd-report',
			'ai-model-card',
			'other',
		);
	}

	/**
	 * Default setting value.
	 *
	 * @return array{doc_type:string,url:string}
	 */
	public static function defaults() {
		return array(
			'doc_type' => 'web-page',
			'url'      => '',
		);
	}

	/**
	 * Hook registration.
	 */
	public static function init() {
		add_action( 'init', array( __CLASS__, 'register' ) );
		// Clear the cached file whenever the setting changes.
		add_action( 'update_option_' . OPTION_NAME, array( __CLASS__, 'flush_cache' ) );
		add_action( 'add_option_' . OPTION_NAME, array( __CLASS__, 'flush_cache' ) );
	}

	/**
	 * Register the object setting with a REST schema so the block-editor
	 * data layer can read and write it via /wp/v2/settings.
	 */
	public static function register() {
		register_setting(
			'options',
			OPTION_NAME,
			array(
				'type'         => 'object',
				'default'      => self::defaults(),
				'show_in_rest' => array(
					'schema' => array(
						'type'                 => 'object',
						'properties'           => array(
							'doc_type' => array(
								'type' => 'string',
								'enum' => self::doc_types(),
							),
							'url'      => array(
								'type'   => 'string',
								'format' => 'uri',
							),
						),
						'additionalProperties' => false,
					),
				),
				'sanitize_callback' => array( __CLASS__, 'sanitize' ),
			)
		);
	}

	/**
	 * Sanitize the setting before it is stored.
	 *
	 * @param mixed $value Raw value.
	 * @return array{doc_type:string,url:string}
	 */
	public static function sanitize( $value ) {
		$defaults = self::defaults();

		if ( ! is_array( $value ) ) {
			return $defaults;
		}

		$doc_type = isset( $value['doc_type'] ) ? sanitize_text_field( $value['doc_type'] ) : $defaults['doc_type'];
		if ( ! in_array( $doc_type, self::doc_types(), true ) ) {
			$doc_type = $defaults['doc_type'];
		}

		$url = isset( $value['url'] ) ? esc_url_raw( trim( (string) $value['url'] ) ) : '';

		return array(
			'doc_type' => $doc_type,
			'url'      => $url,
		);
	}

	/**
	 * Delete the rendered-file cache.
	 */
	public static function flush_cache() {
		delete_transient( CACHE_KEY );
	}
}
