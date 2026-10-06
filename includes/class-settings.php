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
			'0.6' => array(
				'doc_types' => array(
					'web-page',
					'annual-report',
					'sustainability-page',
					'certificate',
					'csrd-report',
					'ai-model-card',
					'measurement-data',
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
	 * @return array{disclosures:array,validate_on_save:bool}
	 */
	public static function defaults() {
		return array(
			'last_updated'          => '',
			'certification_schemes' => array(),
			'disclosures'           => array(),
			'validate_on_save'      => true,
		);
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
							'last_updated'          => array(
								'type' => 'string',
							),
							'certification_schemes' => array(
								'type'  => 'array',
								'items' => array(
									'type'                 => 'object',
									'properties'           => array(
										'id'          => array( 'type' => 'string' ),
										'url'         => array(
											'type'   => 'string',
											'format' => 'uri',
										),
										'title'       => array( 'type' => 'string' ),
										'description' => array( 'type' => 'string' ),
									),
									'additionalProperties' => false,
								),
							),
							'disclosures'           => array(
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
										'description'   => array( 'type' => 'string' ),
										'valid_until'   => array( 'type' => 'string' ),
										'domain'        => array( 'type' => 'string' ),
										'certification_schemes' => array(
											'type'  => 'array',
											'items' => array( 'type' => 'string' ),
										),
									),
									'additionalProperties' => false,
								),
							),
							'validate_on_save'      => array(
								'type'    => 'boolean',
								'default' => true,
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
	 * @return array{last_updated:string,certification_schemes:array,disclosures:array,validate_on_save:bool}
	 */
	public static function normalize( $value ) {
		if ( ! is_array( $value ) ) {
			return self::defaults();
		}

		$schemes = isset( $value['certification_schemes'] ) && is_array( $value['certification_schemes'] ) ? $value['certification_schemes'] : array();

		// Schemes stored before titles were required identify by id alone;
		// backfill the title so they survive the stricter sanitize rules.
		foreach ( $schemes as &$scheme ) {
			if ( is_array( $scheme ) && empty( $scheme['title'] ) && ! empty( $scheme['id'] ) ) {
				$scheme['title'] = $scheme['id'];
			}
		}
		unset( $scheme );

		$normalized = array(
			'last_updated'          => isset( $value['last_updated'] ) ? (string) $value['last_updated'] : '',
			'certification_schemes' => array_values( $schemes ),
			'validate_on_save'      => self::validate_flag( $value ),
		);

		if ( isset( $value['disclosures'] ) && is_array( $value['disclosures'] ) ) {
			$normalized['disclosures'] = array_values( $value['disclosures'] );
			return $normalized;
		}

		// Legacy single-disclosure shape.
		if ( isset( $value['url'] ) || isset( $value['doc_type'] ) ) {
			$normalized['disclosures'] = array(
				array(
					'doc_type' => isset( $value['doc_type'] ) ? $value['doc_type'] : 'web-page',
					'url'      => isset( $value['url'] ) ? $value['url'] : '',
				),
			);
			return $normalized;
		}

		$normalized['disclosures'] = array();
		return $normalized;
	}

	/**
	 * The opt-out flag for validation, defaulting to on when absent
	 * (pre-existing installs never stored it).
	 *
	 * @param array $value Raw value.
	 * @return bool
	 */
	private static function validate_flag( $value ) {
		return ! isset( $value['validate_on_save'] ) || (bool) $value['validate_on_save'];
	}

	/**
	 * Sanitize the setting before it is stored.
	 *
	 * Drops rows without the required fields, omits empty optional fields,
	 * and enforces the references the 0.6 validator checks: scheme ids are
	 * unique, and disclosure scheme refs must point at a known id — so the
	 * file can't be saved in a state that would fail validation.
	 *
	 * @param mixed $value Raw value.
	 * @return array{last_updated:string,certification_schemes:array,disclosures:array,validate_on_save:bool}
	 */
	public static function sanitize( $value ) {
		$value   = self::normalize( $value );
		$schemes = self::sanitize_schemes( $value['certification_schemes'] );
		$known   = array();

		foreach ( $schemes as $scheme ) {
			$known[ $scheme['id'] ] = true;
		}
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

			$description = isset( $disclosure['description'] ) ? sanitize_textarea_field( $disclosure['description'] ) : '';
			if ( '' !== $description ) {
				$entry['description'] = $description;
			}

			$valid_until = isset( $disclosure['valid_until'] ) ? sanitize_text_field( $disclosure['valid_until'] ) : '';
			if ( '' !== $valid_until ) {
				$entry['valid_until'] = $valid_until;
			}

			$domain = isset( $disclosure['domain'] ) ? sanitize_text_field( $disclosure['domain'] ) : '';
			if ( '' !== $domain ) {
				$entry['domain'] = $domain;
			}

			$refs = array();
			foreach ( (array) ( $disclosure['certification_schemes'] ?? array() ) as $ref ) {
				$ref = sanitize_text_field( (string) $ref );
				if ( '' !== $ref && isset( $known[ $ref ] ) && ! in_array( $ref, $refs, true ) ) {
					$refs[] = $ref;
				}
			}
			if ( ! empty( $refs ) ) {
				$entry['certification_schemes'] = $refs;
			}

			$clean[] = $entry;
		}

		return array(
			'last_updated'          => gmdate( 'Y-m-d' ),
			'certification_schemes' => $schemes,
			'disclosures'           => $clean,
			'validate_on_save'      => self::validate_flag( $value ),
		);
	}

	/**
	 * Slugify a scheme title into a stable id, avoiding ids already taken.
	 * Mirrors what the block editor generates client-side.
	 *
	 * @param string   $title Scheme title.
	 * @param string[] $taken Ids already in use.
	 * @return string
	 */
	public static function scheme_slug( $title, $taken = array() ) {
		$slug = sanitize_title( $title );
		if ( '' === $slug ) {
			$slug = 'scheme';
		}

		$id = $slug;
		$n  = 2;
		while ( isset( $taken[ $id ] ) ) {
			$id = $slug . '-' . $n;
			++$n;
		}

		return $id;
	}

	/**
	 * Sanitize the org-level certification scheme list: url and title are
	 * required, ids are generated from the title when absent or colliding,
	 * and rows without the required fields are dropped.
	 *
	 * @param array $schemes Raw scheme rows.
	 * @return array
	 */
	private static function sanitize_schemes( $schemes ) {
		$clean = array();
		$taken = array();

		foreach ( (array) $schemes as $scheme ) {
			if ( ! is_array( $scheme ) ) {
				continue;
			}

			$url = isset( $scheme['url'] ) ? esc_url_raw( trim( (string) $scheme['url'] ) ) : '';
			if ( '' === $url ) {
				continue;
			}

			$title = isset( $scheme['title'] ) ? sanitize_text_field( $scheme['title'] ) : '';
			if ( '' === $title ) {
				continue;
			}

			$id = isset( $scheme['id'] ) ? sanitize_text_field( trim( (string) $scheme['id'] ) ) : '';
			if ( '' === $id || isset( $taken[ $id ] ) ) {
				$id = self::scheme_slug( $title, $taken );
			}

			$taken[ $id ] = true;

			$entry = array(
				'id'    => $id,
				'url'   => $url,
				'title' => $title,
			);

			$description = isset( $scheme['description'] ) ? sanitize_textarea_field( $scheme['description'] ) : '';
			if ( '' !== $description ) {
				$entry['description'] = $description;
			}

			$clean[] = $entry;
		}

		return $clean;
	}

	/**
	 * Delete the rendered-file cache.
	 */
	public static function flush_cache() {
		delete_transient( CACHE_KEY );
	}
}
