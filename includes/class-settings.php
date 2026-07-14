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
	 * @return array{disclosures:array}
	 */
	public static function defaults() {
		return array( 'disclosures' => array() );
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
				'type'              => 'object',
				'default'           => self::defaults(),
				'show_in_rest'      => array(
					'schema' => array(
						'type'                 => 'object',
						'properties'           => array(
							'disclosures' => array(
								'type'  => 'array',
								'items' => array(
									'type'                 => 'object',
									'properties'           => array(
										'doc_type'    => array(
											'type' => 'string',
											'enum' => self::doc_types(),
										),
										'url'         => array(
											'type'   => 'string',
											'format' => 'uri',
										),
										'title'       => array( 'type' => 'string' ),
										'valid_until' => array( 'type' => 'string' ),
									),
									'additionalProperties' => false,
								),
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
	 * Coerce any stored/legacy value into the canonical shape.
	 *
	 * Handles the v0.1.0 single-disclosure shape ({ doc_type, url }).
	 *
	 * @param mixed $value Raw value.
	 * @return array{disclosures:array}
	 */
	public static function normalize( $value ) {
		if ( ! is_array( $value ) ) {
			return self::defaults();
		}

		if ( isset( $value['disclosures'] ) && is_array( $value['disclosures'] ) ) {
			return array( 'disclosures' => array_values( $value['disclosures'] ) );
		}

		// Legacy single-disclosure shape.
		if ( isset( $value['url'] ) || isset( $value['doc_type'] ) ) {
			return array(
				'disclosures' => array(
					array(
						'doc_type' => isset( $value['doc_type'] ) ? $value['doc_type'] : 'web-page',
						'url'      => isset( $value['url'] ) ? $value['url'] : '',
					),
				),
			);
		}

		return self::defaults();
	}

	/**
	 * Sanitize the setting before it is stored.
	 *
	 * Drops rows without a URL and omits empty optional fields.
	 *
	 * @param mixed $value Raw value.
	 * @return array{disclosures:array}
	 */
	public static function sanitize( $value ) {
		$value = self::normalize( $value );
		$clean = array();

		foreach ( $value['disclosures'] as $disclosure ) {
			if ( ! is_array( $disclosure ) ) {
				continue;
			}

			$url = isset( $disclosure['url'] ) ? esc_url_raw( trim( (string) $disclosure['url'] ) ) : '';
			if ( '' === $url ) {
				continue;
			}

			$doc_type = isset( $disclosure['doc_type'] ) ? sanitize_text_field( $disclosure['doc_type'] ) : 'web-page';
			if ( ! in_array( $doc_type, self::doc_types(), true ) ) {
				$doc_type = 'web-page';
			}

			$entry = array(
				'doc_type' => $doc_type,
				'url'      => $url,
			);

			$title = isset( $disclosure['title'] ) ? sanitize_text_field( $disclosure['title'] ) : '';
			if ( '' !== $title ) {
				$entry['title'] = $title;
			}

			$valid_until = isset( $disclosure['valid_until'] ) ? sanitize_text_field( $disclosure['valid_until'] ) : '';
			if ( '' !== $valid_until ) {
				$entry['valid_until'] = $valid_until;
			}

			$clean[] = $entry;
		}

		return array( 'disclosures' => $clean );
	}

	/**
	 * Delete the rendered-file cache.
	 */
	public static function flush_cache() {
		delete_transient( CACHE_KEY );
	}
}
