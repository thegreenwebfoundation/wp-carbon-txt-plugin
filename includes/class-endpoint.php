<?php
/**
 * Serves the carbon.txt file at the site root.
 *
 * @package WpCarbonTxt
 */

namespace WpCarbonTxt;

defined( 'ABSPATH' ) || exit;

/**
 * /carbon.txt endpoint.
 */
class Endpoint {

	/**
	 * Query var used to flag a carbon.txt request.
	 */
	const QUERY_VAR = 'wp_carbon_txt';

	/**
	 * Hook registration.
	 */
	public static function init() {
		add_action( 'init', array( __CLASS__, 'add_rewrite_rule' ) );
		add_filter( 'query_vars', array( __CLASS__, 'register_query_var' ) );
		add_action( 'template_redirect', array( __CLASS__, 'maybe_serve' ) );
	}

	/**
	 * Map /carbon.txt to our query var.
	 */
	public static function add_rewrite_rule() {
		add_rewrite_rule( '^carbon\.txt$', 'index.php?' . self::QUERY_VAR . '=1', 'top' );
	}

	/**
	 * Allow WordPress to recognise our query var.
	 *
	 * @param string[] $vars Query vars.
	 * @return string[]
	 */
	public static function register_query_var( $vars ) {
		$vars[] = self::QUERY_VAR;
		return $vars;
	}

	/**
	 * Output the carbon.txt file when the endpoint is requested.
	 */
	public static function maybe_serve() {
		if ( ! get_query_var( self::QUERY_VAR ) ) {
			return;
		}

		$body = get_transient( CACHE_KEY );
		if ( false === $body ) {
			$body = Renderer::render();
			set_transient( CACHE_KEY, $body, DAY_IN_SECONDS );
		}

		status_header( 200 );
		header( 'Content-Type: text/plain; charset=utf-8' );
		header( 'X-Content-Type-Options: nosniff' );

		echo $body; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Plain-text TOML file, values sanitized on save.
		exit;
	}
}
