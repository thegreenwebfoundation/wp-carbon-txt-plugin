<?php
/**
 * Client for the Green Web Foundation carbon.txt validation API.
 *
 * @see https://developers.thegreenwebfoundation.org/api/carbon-txt/overview
 * @package WpCarbonTxt
 */

namespace WpCarbonTxt;

defined( 'ABSPATH' ) || exit;

/**
 * Validates carbon.txt content against the hosted GWF validator.
 */
class Api_Client {

	/**
	 * API base URL.
	 */
	const BASE_URL = 'https://carbon-txt-api.greenweb.org';

	/**
	 * Request timeout, in seconds.
	 */
	const TIMEOUT = 15;

	/**
	 * Validate carbon.txt file content.
	 *
	 * The API's response body shape for a 200 isn't publicly documented
	 * (only the request schema is), so this returns the decoded JSON as-is
	 * for the caller to interpret defensively rather than assuming field
	 * names here.
	 *
	 * @param string $content Raw carbon.txt content to validate.
	 * @return array|\WP_Error Decoded response body, or an error.
	 */
	public static function validate_content( $content ) {
		if ( ! Api_Key::is_configured() ) {
			return new \WP_Error(
				'wp_carbon_txt_no_api_key',
				__( 'No Green Web Foundation API key is configured.', 'wp-carbon-txt-plugin' ),
				array( 'status' => 400 )
			);
		}

		$response = wp_remote_post(
			self::BASE_URL . '/api/validate/file/',
			array(
				'timeout' => self::TIMEOUT,
				'headers' => array(
					'Content-Type' => 'application/json',
					'X-Api-Key'    => Api_Key::get(),
				),
				'body'    => wp_json_encode( array( 'text_contents' => (string) $content ) ),
			)
		);

		if ( is_wp_error( $response ) ) {
			return new \WP_Error(
				'wp_carbon_txt_api_unreachable',
				__( 'Could not reach the carbon.txt validation service. Check your site’s outbound connectivity and try again.', 'wp-carbon-txt-plugin' ),
				array( 'status' => 502 )
			);
		}

		$code = wp_remote_retrieve_response_code( $response );
		$body = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( 401 === $code || 403 === $code ) {
			return new \WP_Error(
				'wp_carbon_txt_api_unauthorized',
				__( 'The configured API key was rejected. Check that it’s correct and still active.', 'wp-carbon-txt-plugin' ),
				array( 'status' => 401 )
			);
		}

		if ( 429 === $code ) {
			return new \WP_Error(
				'wp_carbon_txt_api_rate_limited',
				__( 'The validation service rate-limited this request. Please wait a moment and try again.', 'wp-carbon-txt-plugin' ),
				array( 'status' => 429 )
			);
		}

		if ( $code < 200 || $code >= 300 ) {
			return new \WP_Error(
				'wp_carbon_txt_api_error',
				sprintf(
					/* translators: %d: HTTP status code returned by the validation service. */
					__( 'The validation service returned an unexpected error (HTTP %d).', 'wp-carbon-txt-plugin' ),
					$code
				),
				array( 'status' => 502 )
			);
		}

		return is_array( $body ) ? $body : array();
	}
}
