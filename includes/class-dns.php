<?php
/**
 * DNS-based discovery for carbon.txt, per the carbon-txt-location TXT
 * record described at https://carbontxt.org/faq.
 *
 * @package WpCarbonTxt
 */

namespace WpCarbonTxt;

defined( 'ABSPATH' ) || exit;

/**
 * Resolves the carbon-txt-location DNS delegation record for a domain.
 */
class Dns {

	/**
	 * Prefix identifying a carbon.txt delegation TXT record, per the
	 * carbon.txt discovery order: DNS TXT record, then domain root, then
	 * well-known location, then CarbonTxt-Location HTTP header.
	 */
	const TXT_PREFIX = 'carbon-txt-location=';

	/**
	 * How long a lookup result is cached for. This only feeds the settings
	 * screen's own notice, not the site's public carbon.txt output, so a
	 * day-old answer is fine in exchange for not issuing a live DNS query
	 * on every admin page load.
	 */
	const CACHE_TTL = DAY_IN_SECONDS;

	/**
	 * Reserved / development-only suffixes a real public site can't live
	 * under. Deliberately excludes '.dev' — a real gTLD Google operates.
	 */
	const NON_PUBLIC_SUFFIXES = array( 'local', 'test', 'localhost', 'example', 'invalid', 'home', 'localdomain', 'lan', 'internal' );

	/**
	 * Look up the carbon-txt-location TXT record for a domain, if any.
	 *
	 * The record's value isn't guaranteed to be a full URL — real-world
	 * records (e.g. thegreenwebfoundation.org's own staging subdomain)
	 * point to a bare domain, delegating the rest of the discovery order
	 * to be re-run against it.
	 *
	 * @param string $domain Domain to query, without scheme or path.
	 * @return string|null The delegated location, or null if none was found.
	 */
	public static function resolve_carbon_txt_location( $domain ) {
		if ( ! $domain || ! function_exists( 'dns_get_record' ) ) {
			return null;
		}

		$records = @dns_get_record( $domain, DNS_TXT ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- A resolver failure (e.g. no network) should read the same as "no record found", not fatal.

		if ( ! $records ) {
			return null;
		}

		foreach ( $records as $record ) {
			$txt = isset( $record['txt'] ) ? $record['txt'] : '';

			if ( 0 === strpos( $txt, self::TXT_PREFIX ) ) {
				$location = trim( substr( $txt, strlen( self::TXT_PREFIX ) ) );

				return '' !== $location ? $location : null;
			}
		}

		return null;
	}

	/**
	 * The www/apex counterpart of a domain, e.g. example.com <->
	 * www.example.com. Per the carbon.txt discovery order, a validator
	 * retries the alternate host when the first lookup comes up empty, so
	 * this plugin's own check should match that rather than report a false
	 * "no record" for a site whose record lives on the other variant.
	 *
	 * @param string $domain Domain.
	 * @return string
	 */
	private static function alternate_domain( $domain ) {
		return ( 0 === strpos( $domain, 'www.' ) )
			? substr( $domain, 4 )
			: 'www.' . $domain;
	}

	/**
	 * Domain this site's own carbon.txt delegation record would live on.
	 *
	 * Filterable so the record can be checked against a different domain
	 * during development, when the site isn't reachable under its own
	 * hostname.
	 *
	 * @return string|null
	 */
	public static function site_domain() {
		$domain = wp_parse_url( home_url(), PHP_URL_HOST );

		/**
		 * Filters the domain used to look up this site's carbon-txt-location
		 * DNS record.
		 *
		 * @param string|null $domain Domain derived from home_url().
		 */
		return apply_filters( 'wp_carbon_txt_dns_domain', $domain );
	}

	/**
	 * Whether a domain looks publicly reachable.
	 *
	 * The Green Web Foundation's validator fetches carbon.txt from the live
	 * web, so pointing it at a local or staging hostname would only burn an
	 * API request on a domain they can't reach — those are skipped instead.
	 * Subdomains of a public domain (e.g. staging.example.com) pass: they're
	 * publicly resolvable even when they host non-production copies.
	 *
	 * Filterable so hosts with extra local conventions can extend the
	 * non-public list, and so a test can force the check to pass.
	 *
	 * @param string|null $domain Domain to check, without scheme or path.
	 * @return bool
	 */
	public static function is_public_domain( $domain ) {
		$domain = (string) $domain;

		$is_public =
			'' !== $domain &&
			! filter_var( $domain, FILTER_VALIDATE_IP ) &&
			false !== strpos( $domain, '.' ) &&
			! preg_match( '/\.(?:' . implode( '|', self::NON_PUBLIC_SUFFIXES ) . ')$/i', $domain );

		/**
		 * Filters whether a domain is considered publicly reachable.
		 *
		 * @param bool   $is_public Whether the domain looks public.
		 * @param string $domain    The domain being checked.
		 */
		return apply_filters( 'wp_carbon_txt_is_public_domain', $is_public, $domain );
	}

	/**
	 * Summarize this site's DNS delegation state for the settings screen,
	 * trying the www/apex counterpart if the first lookup finds nothing.
	 * Cached per domain — see CACHE_TTL.
	 *
	 * @return array{domain:string|null,location:string|null}
	 */
	public static function summary() {
		$domain = self::site_domain();

		if ( ! $domain ) {
			return array(
				'domain'   => null,
				'location' => null,
			);
		}

		$cache_key = 'wp_carbon_txt_dns_' . md5( $domain );
		$cached    = get_transient( $cache_key );

		if ( false !== $cached ) {
			return $cached;
		}

		$location = self::resolve_carbon_txt_location( $domain );

		if ( null === $location ) {
			$location = self::resolve_carbon_txt_location( self::alternate_domain( $domain ) );
		}

		$summary = array(
			'domain'   => $domain,
			'location' => $location,
		);

		set_transient( $cache_key, $summary, self::CACHE_TTL );

		return $summary;
	}
}
