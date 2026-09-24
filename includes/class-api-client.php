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
 * Asks the hosted GWF validator to validate this site's domain — GWF then
 * fetches the site's live carbon.txt itself.
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
	 * Validate a domain against the hosted GWF validator.
	 *
	 * GWF fetches `https://{domain}/carbon.txt` itself, exercising DNS
	 * delegation, TXT records and live response headers, and registers the
	 * domain in their dashboard register when it passes — so only a
	 * publicly reachable domain is worth sending.
	 *
	 * The API's response body shape for a 200 isn't publicly documented
	 * (only the request schema is), so this returns the decoded JSON as-is
	 * for the caller to interpret defensively rather than assuming field
	 * names here.
	 *
	 * @param string $domain Domain to validate, without scheme or path.
	 * @return array|\WP_Error Decoded response body, or an error.
	 */
	public static function validate_domain( $domain ) {
		if ( ! Api_Key::is_configured() ) {
			return new \WP_Error(
				'wp_carbon_txt_no_api_key',
				__( 'No Green Web Foundation API key is configured.', 'carbon-txt' ),
				array( 'status' => 400 )
			);
		}

		if ( ! Dns::is_public_domain( $domain ) ) {
			return new \WP_Error(
				'wp_carbon_txt_domain_not_public',
				sprintf(
					/* translators: %s: this site's domain. */
					__( 'Validation skipped: %s doesn’t look like a publicly reachable domain. For this to work, your carbon.txt file must be accessible on the live web.', 'carbon-txt' ),
					'' !== (string) $domain ? (string) $domain : __( 'this site', 'carbon-txt' )
				),
				array( 'status' => 400 )
			);
		}

		$response = wp_remote_post(
			self::BASE_URL . '/api/validate/domain/',
			array(
				'timeout' => self::TIMEOUT,
				'headers' => array(
					'Content-Type' => 'application/json',
					'X-Api-Key'    => Api_Key::get(),
				),
				'body'    => wp_json_encode( array( 'domain' => (string) $domain ) ),
			)
		);

		if ( is_wp_error( $response ) ) {
			return new \WP_Error(
				'wp_carbon_txt_api_unreachable',
				__( 'Could not reach the carbon.txt validation service. Check your site’s outbound connectivity and try again.', 'carbon-txt' ),
				array( 'status' => 502 )
			);
		}

		$code = wp_remote_retrieve_response_code( $response );
		$body = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( 401 === $code || 403 === $code ) {
			return new \WP_Error(
				'wp_carbon_txt_api_unauthorized',
				__( 'The configured API key was rejected. Check that it’s correct and still active. If you continue to experience problems get in touch with Green Web Foundation\'s support.', 'carbon-txt' ),
				array( 'status' => 401 )
			);
		}

		if ( 429 === $code ) {
			return new \WP_Error(
				'wp_carbon_txt_api_rate_limited',
				__( 'The validation service rate-limited this request. Please wait a moment and try again.', 'carbon-txt' ),
				array( 'status' => 429 )
			);
		}

		if ( $code < 200 || $code >= 300 ) {
			return new \WP_Error(
				'wp_carbon_txt_api_error',
				sprintf(
					/* translators: %d: HTTP status code returned by the validation service. */
					__( 'The validation service returned an unexpected error (HTTP %d).', 'carbon-txt' ),
					$code
				),
				array( 'status' => 502 )
			);
		}

		return is_array( $body ) ? $body : array();
	}
}
