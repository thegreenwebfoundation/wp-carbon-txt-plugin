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
	 * Per-spec-version disclosure profiles. Add an entry here when a new
	 * carbon.txt syntax version ships, rather than touching call sites —
	 * everything that varies by version (currently just the doc_type enum)
	 * lives in this one table.
	 *
	 * @return array<string,array{doc_types:string[]}>
	 */
	private static function profiles() {
		return array(
			'0.5' => array(
				'doc_types' => array(
					'web-page',
					'annual-report',
					'sustainability-page',
					'certificate',
					'csrd-report',
					'ai-model-card',
					'other',
				),
			),
		);
	}

	/**
	 * The newest carbon.txt syntax version this plugin knows about. This is
	 * always the version the plugin generates.
	 *
	 * @return string
	 */
	public static function latest_version() {
		$versions = array_keys( self::profiles() );
		usort( $versions, 'version_compare' );
		return end( $versions );
	}

	/**
	 * Valid carbon.txt disclosure document types for a given spec version.
	 *
	 * @param string|null $version Spec version, e.g. "0.5". Defaults to the
	 *                              latest known version.
	 * @return string[]
	 */
	public static function doc_types( $version = null ) {
		$profiles = self::profiles();
		if ( null === $version || ! isset( $profiles[ $version ] ) ) {
			$version = self::latest_version();
		}
		return $profiles[ $version ]['doc_types'];
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
		// Ensure reads always return the canonical shape (upgrades legacy data).
		add_filter( 'option_' . OPTION_NAME, array( __CLASS__, 'normalize' ) );
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
										'doc_type'      => array(
											'type' => 'string',
											'enum' => self::doc_types(),
										),
										'url'           => array(
											'type'   => 'string',
											'format' => 'uri',
										),
										'page_id'       => array( 'type' => 'integer' ),
										'attachment_id' => array( 'type' => 'integer' ),
										'title'         => array( 'type' => 'string' ),
										'valid_until'   => array( 'type' => 'string' ),
										'domain'        => array( 'type' => 'string' ),
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

			// Editing convenience only — never rendered into carbon.txt.
			// Lets the settings screen re-select the same page on revisit
			// instead of falling back to plain-URL mode.
			$page_id = isset( $disclosure['page_id'] ) ? absint( $disclosure['page_id'] ) : 0;
			if ( $page_id > 0 ) {
				$entry['page_id'] = $page_id;
			}

			// Same convenience, for a disclosure pointed at a media library file.
			$attachment_id = isset( $disclosure['attachment_id'] ) ? absint( $disclosure['attachment_id'] ) : 0;
			if ( $attachment_id > 0 ) {
				$entry['attachment_id'] = $attachment_id;
			}

			$title = isset( $disclosure['title'] ) ? sanitize_text_field( $disclosure['title'] ) : '';
			if ( '' !== $title ) {
				$entry['title'] = $title;
			}

			$valid_until = isset( $disclosure['valid_until'] ) ? sanitize_text_field( $disclosure['valid_until'] ) : '';
			if ( '' !== $valid_until ) {
				$entry['valid_until'] = $valid_until;
			}

			$domain = isset( $disclosure['domain'] ) ? sanitize_text_field( $disclosure['domain'] ) : '';
			if ( '' !== $domain ) {
				$entry['domain'] = $domain;
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
