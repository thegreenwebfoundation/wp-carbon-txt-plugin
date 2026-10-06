/**
 * Carbon.txt settings screen.
 */
import {
	createRoot,
	createInterpolateElement,
	useState,
	useRef,
	useEffect,
} from '@wordpress/element';
import { useEntityProp, store as coreStore } from '@wordpress/core-data';
import { useSelect, useDispatch, select as dataSelect } from '@wordpress/data';
import { useDebounce } from '@wordpress/compose';
import apiFetch from '@wordpress/api-fetch';
import { __, sprintf } from '@wordpress/i18n';
import {
	Card,
	CardBody,
	CardHeader,
	CheckboxControl,
	Flex,
	FlexBlock,
	FlexItem,
	SelectControl,
	TextControl,
	TextareaControl,
	ComboboxControl,
	Button,
	Notice,
	ExternalLink,
	Panel,
	PanelBody,
	/* eslint-disable @wordpress/no-unsafe-wp-apis -- Long-stable components; revisit when they graduate. */
	__experimentalToggleGroupControl as ToggleGroupControl,
	__experimentalToggleGroupControlOption as ToggleGroupControlOption,
	__experimentalHeading as Heading,
	__experimentalText as Text,
	__experimentalVStack as VStack,
	/* eslint-enable @wordpress/no-unsafe-wp-apis */
} from '@wordpress/components';

const {
	optionName,
	docTypes,
	carbonTxtUrl,
	carbonTxtVersion,
	// Today's date from the server's clock (UTC) — the same stamp a save
	// will write — not the browser's clock.
	today: serverToday,
	existingFile: initialExistingFile,
	wellKnownFile: initialWellKnownFile,
	dnsRecord: initialDnsRecord,
} = window.wpCarbonTxt;

/**
 * Per-location text for ExistingFileNotice. Keyed by the same 'root' /
 * 'well_known' value used as the REST `location` param, so no separate
 * field is needed to carry that back to the request.
 */
const FILE_LOCATIONS = {
	root: {
		intro: __(
			'An existing carbon.txt file was found on your server at:',
			'carbon-txt'
		),
		explanation: __(
			'Depending on your hosting configuration, your web server may keep serving the existing file instead of the version this plugin generates — saving here might not change what visitors see until the existing file is removed or renamed.',
			'carbon-txt'
		),
		spokenMessage: __(
			'An existing carbon.txt file was found on your server.',
			'carbon-txt'
		),
	},
	well_known: {
		intro: __(
			'A carbon.txt file was also found at the well-known location:',
			'carbon-txt'
		),
		explanation: __(
			'The carbon.txt file this plugin generates takes priority over the well-known location. To avoid confusion we recommend removing the existing file.',
			'carbon-txt'
		),
		spokenMessage: __(
			'A carbon.txt file was found at the well-known location.',
			'carbon-txt'
		),
	},
};

const DOC_TYPE_LABELS = {
	'web-page': __( 'Web page', 'carbon-txt' ),
	'annual-report': __( 'Annual report', 'carbon-txt' ),
	'sustainability-page': __( 'Sustainability page', 'carbon-txt' ),
	certificate: __( 'Certificate', 'carbon-txt' ),
	'csrd-report': __( 'CSRD report', 'carbon-txt' ),
	'ai-model-card': __( 'AI model card', 'carbon-txt' ),
	'measurement-data': __( 'Measurement data', 'carbon-txt' ),
	other: __( 'Other', 'carbon-txt' ),
};

/**
 * Encode a value as a TOML basic string. Control characters (line breaks
 * above all) must be escaped — a raw newline would make the file invalid
 * TOML.
 *
 * @param {string} value Value.
 * @return {string} Quoted string.
 */
const TOML_ESCAPES = {
	'\b': '\\b',
	'\t': '\\t',
	'\n': '\\n',
	'\f': '\\f',
	'\r': '\\r',
};

const tomlString = ( value ) =>
	'"' +
	String( value )
		.replace( /\\/g, '\\\\' )
		.replace( /"/g, '\\"' )
		.replace(
			/[\x00-\x1F\x7F]/g,
			( c ) =>
				TOML_ESCAPES[ c ] ??
				'\\u' +
					c
						.charCodeAt( 0 )
						.toString( 16 )
						.padStart( 4, '0' )
						.toUpperCase()
		) +
	'"';

/**
 * Encode a date as a native TOML local date when it is a plain YYYY-MM-DD.
 *
 * @param {string} value Value.
 * @return {string} TOML date or quoted string.
 */
const tomlDate = ( value ) => {
	const trimmed = String( value ).trim();
	return /^\d{4}-\d{2}-\d{2}$/.test( trimmed )
		? trimmed
		: tomlString( trimmed );
};

/**
 * Render a single disclosure as a TOML inline table.
 *
 * @param {Object} disclosure Disclosure data.
 * @return {string} Inline table.
 */
const renderDisclosure = ( disclosure ) => {
	const pairs = [
		`doc_type = ${ tomlString( disclosure.doc_type || 'web-page' ) }`,
		`url = ${ tomlString( disclosure.url ) }`,
	];
	if ( disclosure.title ) {
		pairs.push( `title = ${ tomlString( disclosure.title ) }` );
	}
	if ( disclosure.description ) {
		pairs.push( `description = ${ tomlString( disclosure.description ) }` );
	}
	if ( disclosure.valid_until ) {
		pairs.push( `valid_until = ${ tomlDate( disclosure.valid_until ) }` );
	}
	if ( disclosure.domain ) {
		pairs.push( `domain = ${ tomlString( disclosure.domain ) }` );
	}
	if ( disclosure.certification_schemes?.length ) {
		pairs.push(
			`certification_schemes = [ ${ disclosure.certification_schemes
				.map( tomlString )
				.join( ', ' ) } ]`
		);
	}
	return `{ ${ pairs.join( ', ' ) } }`;
};

/**
 * Copy text to the clipboard. `navigator.clipboard` only exists in secure
 * contexts (HTTPS, or localhost) — on a plain-HTTP site (common on local
 * dev environments) it's `undefined`, not just permission-denied, so this
 * falls back to the older `document.execCommand( 'copy' )` technique via a
 * temporary off-screen textarea.
 *
 * @param {string} text Text to copy.
 * @return {Promise} Resolves on success, rejects on failure.
 */
const copyToClipboard = ( text ) => {
	if ( window.navigator?.clipboard?.writeText ) {
		return window.navigator.clipboard.writeText( text );
	}

	return new Promise( ( resolve, reject ) => {
		const textarea = document.createElement( 'textarea' );
		textarea.value = text;
		textarea.setAttribute( 'readonly', '' );
		textarea.style.position = 'fixed';
		textarea.style.top = '-1000px';
		document.body.appendChild( textarea );
		textarea.select();

		try {
			if ( document.execCommand( 'copy' ) ) {
				resolve();
			} else {
				reject( new Error( 'execCommand( "copy" ) failed' ) );
			}
		} catch ( error ) {
			reject( error );
		} finally {
			document.body.removeChild( textarea );
		}
	} );
};

/**
 * Slugify a scheme title into a TOML-friendly id, mirroring the PHP side
 * (which uses WordPress's sanitize_title). Falls back to a generic id for
 * titles with no latin characters.
 *
 * @param {string} value Title.
 * @return {string} Slug.
 */
const slugify = ( value ) =>
	String( value )
		.toLowerCase()
		.normalize( 'NFKD' )
		.replace( /[\u0300-\u036f]/g, '' )
		.replace( /[^a-z0-9]+/g, '-' )
		.replace( /^-+|-+$/g, '' )
		.slice( 0, 100 );

/**
 * Pick an id for a scheme derived from its title, suffixing -2, -3… when
 * another scheme already uses the slug.
 *
 * @param {string} title     Scheme title.
 * @param {Array}  schemes   Current scheme list (may include the target row).
 * @param {number} selfIndex Index of the target row, excluded from the set.
 * @return {string} Unused id.
 */
const uniqueSchemeId = ( title, schemes, selfIndex ) => {
	const taken = new Set(
		schemes
			.filter( ( _, i ) => i !== selfIndex )
			.map( ( scheme ) => scheme.id )
			.filter( Boolean )
	);
	const base = slugify( title ) || 'scheme';
	let id = base;
	for ( let n = 2; taken.has( id ); n++ ) {
		id = `${ base }-${ n }`;
	}
	return id;
};

/**
 * Render a single certification scheme as a TOML inline table.
 *
 * @param {Object} scheme Scheme data.
 * @return {string} Inline table.
 */
const renderScheme = ( scheme ) => {
	const pairs = [
		`id = ${ tomlString( scheme.id ) }`,
		`url = ${ tomlString( scheme.url ) }`,
	];
	if ( scheme.title ) {
		pairs.push( `title = ${ tomlString( scheme.title ) }` );
	}
	if ( scheme.description ) {
		pairs.push( `description = ${ tomlString( scheme.description ) }` );
	}
	return `{ ${ pairs.join( ', ' ) } }`;
};

/**
 * Mirror of the PHP renderer for the live preview.
 *
 * @param {Array} disclosures Disclosure list.
 * @param {Array} schemes     Org-level certification scheme list.
 * @return {string} carbon.txt body.
 */
const renderCarbonTxt = ( disclosures, schemes = [] ) => {
	const entries = disclosures.filter(
		( disclosure ) => disclosure.url && disclosure.url.trim()
	);
	const schemeEntries = schemes.filter(
		( scheme ) =>
			scheme.id && scheme.id.trim() && scheme.url && scheme.url.trim()
	);

	let out = `version = "${ carbonTxtVersion }"\nlast_updated = ${ serverToday }\n\n[org]\n`;
	if ( schemeEntries.length ) {
		out +=
			'certification_schemes = [\n' +
			schemeEntries
				.map( ( s ) => '    ' + renderScheme( s ) + ',' )
				.join( '\n' ) +
			'\n]\n';
	}
	if ( ! entries.length ) {
		out += 'disclosures = []\n';
	} else {
		out +=
			'disclosures = [\n' +
			entries
				.map( ( d ) => '    ' + renderDisclosure( d ) + ',' )
				.join( '\n' ) +
			'\n]\n';
	}
	return out;
};

/**
 * Searchable published-page picker. Remembers the selected page by ID
 * (via `onChange`'s `page_id`) so a previously chosen page is still shown
 * by title on revisit, even if it isn't among the current search results.
 *
 * @param {Object}   props          Props.
 * @param {string}   props.value    Current URL (used to pre-fill the field).
 * @param {?number}  props.pageId   ID of the previously selected page, if any.
 * @param {Function} props.onChange Called with { url, page_id }.
 */
function PagePicker( { value, pageId, onChange } ) {
	const [ search, setSearch ] = useState( '' );
	const debouncedSetSearch = useDebounce( setSearch, 250 );

	const { pages, selectedPage } = useSelect(
		( select ) => {
			const core = select( coreStore );
			return {
				pages: core.getEntityRecords( 'postType', 'page', {
					per_page: 20,
					status: 'publish',
					search: search || undefined,
					orderby: search ? 'relevance' : 'title',
					order: search ? 'desc' : 'asc',
				} ),
				selectedPage: pageId
					? core.getEntityRecord( 'postType', 'page', pageId )
					: null,
			};
		},
		[ search, pageId ]
	);

	const options = [];
	const seenIds = new Set();

	// Always offer the currently selected page as an option, even before
	// it shows up in (or if it never matches) the search results, so the
	// combobox can display its title instead of falling back to the URL.
	if ( selectedPage ) {
		options.push( {
			value: selectedPage.link,
			label: selectedPage.title?.rendered || selectedPage.link,
		} );
		seenIds.add( selectedPage.id );
	}

	( pages || [] ).forEach( ( page ) => {
		if ( seenIds.has( page.id ) ) {
			return;
		}
		seenIds.add( page.id );
		options.push( {
			value: page.link,
			label: page.title?.rendered || page.link,
		} );
	} );

	const handleChange = ( nextValue ) => {
		if ( ! nextValue ) {
			onChange( { url: '', page_id: undefined } );
			return;
		}

		const match =
			( pages || [] ).find( ( page ) => page.link === nextValue ) ||
			( selectedPage && selectedPage.link === nextValue
				? selectedPage
				: null );

		onChange( {
			url: nextValue,
			page_id: match ? match.id : undefined,
		} );
	};

	return (
		<ComboboxControl
			label={ __( 'Select a published page', 'carbon-txt' ) }
			help={ __(
				"Search your pages by title. We'll populate your carbon.txt file with its permalink.",
				'carbon-txt'
			) }
			value={ value }
			options={ options }
			onFilterValueChange={ debouncedSetSearch }
			onChange={ handleChange }
			__next40pxDefaultSize
		/>
	);
}

/**
 * Media library file picker, built on the classic wp.media() frame rather
 * than @wordpress/block-editor's <MediaUpload>, so this plugin doesn't need
 * that package as a dependency just for one modal. Remembers the selected
 * attachment by ID (via `onChange`'s `attachment_id`) the same way
 * PagePicker remembers a page.
 *
 * @param {Object}   props              Props.
 * @param {string}   props.value        Current URL (shown when no attachment title is available).
 * @param {?number}  props.attachmentId ID of the previously selected attachment, if any.
 * @param {Function} props.onChange     Called with { url, attachment_id }.
 * @param {string}   [props.help]       Optional help text shown below the button.
 */
function MediaPicker( { value, attachmentId, onChange, help } ) {
	const selectedAttachment = useSelect(
		( select ) =>
			attachmentId
				? select( coreStore ).getEntityRecord(
						'postType',
						'attachment',
						attachmentId
				  )
				: null,
		[ attachmentId ]
	);

	const openMediaLibrary = () => {
		const frame = wp.media( {
			title: __( 'Select a file', 'carbon-txt' ),
			button: { text: __( 'Use this file', 'carbon-txt' ) },
			multiple: false,
		} );

		frame.on( 'select', () => {
			const attachment = frame
				.state()
				.get( 'selection' )
				.first()
				.toJSON();

			onChange( {
				url: attachment.url,
				attachment_id: attachment.id,
			} );
		} );

		frame.open();
	};

	const label = selectedAttachment
		? selectedAttachment.title?.rendered || value
		: value;

	return (
		<VStack spacing={ 2 }>
			<Text>
				{ label
					? sprintf(
							/* translators: %s: selected file name or URL. */
							__( 'Selected file: %s', 'carbon-txt' ),
							label
					  )
					: __( 'No file selected yet.', 'carbon-txt' ) }
			</Text>
			<Button variant="secondary" onClick={ openMediaLibrary }>
				{ value
					? __( 'Choose a different file', 'carbon-txt' )
					: __( 'Choose a file', 'carbon-txt' ) }
			</Button>
			{ help && <Text variant="muted">{ help }</Text> }
		</VStack>
	);
}

/**
 * Delete the existing file at a given location. Module-level and stable
 * (not recreated per render) so it can be called from a useEffect without
 * dependency-array churn.
 *
 * @param {'root'|'well_known'} location Which location to delete at.
 * @return {Promise} Resolves on success, rejects with the REST error.
 */
const deleteExistingFile = ( location ) =>
	apiFetch( {
		path: `/wp-carbon-txt/v1/existing-file?location=${ location }`,
		method: 'DELETE',
	} );

/**
 * Warns that a DNS TXT record delegates carbon.txt discovery elsewhere.
 * Per the carbon.txt discovery order (DNS, then domain root, then
 * well-known, then HTTP header), this ranks above any file this plugin
 * generates — there's nothing to import or delete here, since the plugin
 * has no control over DNS, so this is informational only.
 *
 * @param {{dnsRecord:{domain:?string,location:?string}}} props Props.
 */
function DnsRecordNotice( { dnsRecord } ) {
	if ( ! dnsRecord.location ) {
		return null;
	}

	return (
		<div style={ { margin: '16px 0' } }>
			<Notice
				status="warning"
				isDismissible={ false }
				spokenMessage={ __(
					'A DNS record was found delegating carbon.txt discovery to another location.',
					'carbon-txt'
				) }
			>
				<VStack spacing={ 2 } alignment="left">
					<Text>
						{ __(
							'A DNS TXT record on your domain delegates carbon.txt discovery to:',
							'carbon-txt'
						) }{ ' ' }
						<code>{ dnsRecord.location }</code>
					</Text>
					<Text>
						{ __(
							'A DNS record takes priority over any file this plugin generates — visitors and validators will follow it instead. If that’s intentional, no action is needed; otherwise, review or remove the carbon-txt-location TXT record on your domain so this plugin’s file is used.',
							'carbon-txt'
						) }
					</Text>
				</VStack>
			</Notice>
		</div>
	);
}

/**
 * Warns about a carbon.txt file already on the server — at either the
 * domain root or the well-known location — and offers to import any
 * disclosures parsed out of it. Once a disclosure has been imported and
 * saved, the file is no longer needed and is deleted automatically (its
 * data now lives in the plugin's own settings); a manual delete button
 * covers the case where the admin doesn't import from it. Self-contained:
 * tracks its own copy of the file's existence and import/delete state, so
 * two independent instances (one per location) don't need to share state
 * through App.
 *
 * @param {Object}              props                 Props.
 * @param {'root'|'well_known'} props.location        Which location this instance is for.
 * @param {Object}              props.initialFileInfo Existing-file summary from the server.
 * @param {Function}            props.onImport        Called with the file's disclosures to import them.
 * @param {number}              props.saveCount       Number of settings saves that have succeeded so far.
 */
function ExistingFileNotice( {
	location,
	initialFileInfo,
	onImport,
	saveCount,
} ) {
	const [ fileInfo, setFileInfo ] = useState( initialFileInfo );
	const [ hasImported, setHasImported ] = useState( false );
	const [ saveCountAtImport, setSaveCountAtImport ] = useState( null );
	const [ isDeleting, setIsDeleting ] = useState( false );
	const [ deleteError, setDeleteError ] = useState( null );
	const [ confirming, setConfirming ] = useState( false );

	const runDelete = async () => {
		setIsDeleting( true );
		setDeleteError( null );

		try {
			await deleteExistingFile( location );
			setFileInfo( ( info ) => ( { ...info, exists: false } ) );
		} catch ( error ) {
			setDeleteError(
				error?.message ||
					__( 'Could not delete the existing file.', 'carbon-txt' )
			);
		} finally {
			setIsDeleting( false );
		}
	};

	// Once a save succeeds *after* this file's disclosures were imported,
	// its data is safely in the plugin's own settings, so delete it
	// automatically rather than leaving it to shadow the plugin's output.
	useEffect( () => {
		if (
			hasImported &&
			saveCountAtImport !== null &&
			saveCount > saveCountAtImport &&
			fileInfo.exists
		) {
			runDelete();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps -- runDelete is stable in effect; only saveCount changing should trigger this.
	}, [ saveCount ] );

	if ( ! fileInfo.exists ) {
		return null;
	}

	const text = FILE_LOCATIONS[ location ];

	const handleImport = () => {
		onImport( fileInfo.disclosures, fileInfo.schemes );
		setHasImported( true );
		setSaveCountAtImport( saveCount );
	};

	const importableCount =
		fileInfo.disclosures.length + fileInfo.schemes.length;
	const canImport = ! hasImported;
	// Once imported, deletion happens automatically on the next save; the
	// manual button is only a fallback if that automatic attempt failed.
	const canDelete = saveCount > 0 && ( ! hasImported || deleteError );

	return (
		<div style={ { margin: '16px 0' } }>
			<Notice
				status="warning"
				isDismissible={ false }
				spokenMessage={ text.spokenMessage }
			>
				<VStack spacing={ 2 } alignment="left">
					<Text>
						{ text.intro } <code>{ fileInfo.path }</code>
					</Text>
					<Text>{ text.explanation }</Text>

					{ canImport &&
						fileInfo.disclosures.length > 0 &&
						fileInfo.file_version &&
						fileInfo.file_version !== carbonTxtVersion && (
							<Text>
								{ sprintf(
									/* translators: 1: carbon.txt syntax version found in the file. 2: carbon.txt syntax version this plugin generates. */
									__(
										'This file uses carbon.txt version %1$s. Importing will update it to version %2$s, the version this plugin generates.',
										'carbon-txt'
									),
									fileInfo.file_version,
									carbonTxtVersion
								) }
							</Text>
						) }

					{ canImport && importableCount > 0 && (
						<Button variant="secondary" onClick={ handleImport }>
							{ fileInfo.disclosures.length
								? sprintf(
										/* translators: %d: number of disclosures found in the existing file. */
										__(
											'Import %d disclosure(s) from this file',
											'carbon-txt'
										),
										fileInfo.disclosures.length
								  )
								: sprintf(
										/* translators: %d: number of certification schemes found in the existing file. */
										__(
											'Import %d certification scheme(s) from this file',
											'carbon-txt'
										),
										fileInfo.schemes.length
								  ) }
						</Button>
					) }

					{ hasImported && (
						<Text>
							{ isDeleting
								? __( 'Removing the old file…', 'carbon-txt' )
								: __(
										'Imported. Once you save, this file will be permanently deleted — its data now lives in your plugin settings.',
										'carbon-txt'
								  ) }
						</Text>
					) }

					{ fileInfo.unsupported_version && (
						<Text>
							{ sprintf(
								/* translators: %s: carbon.txt syntax version found in the file. */
								__(
									'This file uses carbon.txt version %s, which is newer than this plugin supports. Update the plugin, then reload this page to import it.',
									'carbon-txt'
								),
								fileInfo.unsupported_version
							) }
						</Text>
					) }

					{ ! fileInfo.disclosures.length && fileInfo.raw && (
						<details>
							<summary>
								{ fileInfo.unsupported_version
									? __( 'View the raw file', 'carbon-txt' )
									: __(
											"We couldn't automatically read its disclosures — view the raw file",
											'carbon-txt'
									  ) }
							</summary>
							<pre
								style={ {
									overflowX: 'auto',
									fontSize: 12,
									lineHeight: 1.6,
								} }
							>
								{ fileInfo.raw }
							</pre>
						</details>
					) }

					{ canDelete && ! confirming && (
						<Button
							variant="tertiary"
							isDestructive
							onClick={ () => setConfirming( true ) }
						>
							{ __(
								"Delete existing file so this plugin's carbon.txt file is used instead.",
								'carbon-txt'
							) }
						</Button>
					) }

					{ canDelete && confirming && (
						<VStack spacing={ 2 } alignment="left">
							<Text>
								{ __(
									'This cannot be undone. Continue?',
									'carbon-txt'
								) }
							</Text>
							<Flex
								expanded={ false }
								justify="flex-start"
								gap={ 2 }
							>
								<Button
									variant="primary"
									isDestructive
									isBusy={ isDeleting }
									disabled={ isDeleting }
									onClick={ runDelete }
								>
									{ __( 'Yes, delete it', 'carbon-txt' ) }
								</Button>
								<Button
									variant="tertiary"
									disabled={ isDeleting }
									onClick={ () => setConfirming( false ) }
								>
									{ __( 'Cancel', 'carbon-txt' ) }
								</Button>
							</Flex>
							{ deleteError && (
								<Text style={ { color: '#cc1818' } }>
									{ deleteError }
								</Text>
							) }
						</VStack>
					) }
				</VStack>
			</Notice>
		</div>
	);
}

/**
 * The URL-source mode a disclosure was last edited in, inferred from
 * which internal id field (if any) is set. A disclosure with no data at
 * all (a fresh row) defaults to 'page', the first option in the UI.
 *
 * @param {Object} disclosure Disclosure data.
 * @return {string} One of 'url', 'page', or 'media'.
 */
const modeFor = ( disclosure ) => {
	if ( disclosure.page_id ) {
		return 'page';
	}
	if ( disclosure.attachment_id ) {
		return 'media';
	}
	if ( disclosure.url ) {
		return 'url';
	}
	return 'page';
};

/**
 * Editor for the org-level certification schemes (carbon.txt 0.6). Each
 * scheme defines a reusable id that "Certificate" disclosures reference
 * in their `certification_schemes` list, so this section must come first
 * — a disclosure can't cite a scheme that doesn't exist yet.
 *
 * @param {Object}   props          Props.
 * @param {Array}    props.schemes  Current scheme list.
 * @param {Function} props.onChange Called with the next scheme list.
 */
function SchemesSection( { schemes, onChange } ) {
	const updateScheme = ( index, changes ) =>
		onChange(
			schemes.map( ( scheme, i ) => {
				if ( i !== index ) {
					return scheme;
				}
				const next = { ...scheme, ...changes };
				// The id is managed automatically: derived from the title and
				// kept in sync as it's typed. updateSchemes() remaps the
				// disclosure refs when the id changes, so links survive.
				if ( 'title' in changes ) {
					next.id =
						next.title && next.title.trim()
							? uniqueSchemeId( next.title, schemes, index )
							: '';
				}
				return next;
			} )
		);

	const removeScheme = ( index ) =>
		onChange( schemes.filter( ( _, i ) => i !== index ) );

	const addScheme = () =>
		onChange( [ ...schemes, { id: '', url: '', title: '' } ] );

	return (
		<PanelBody
			title={ __(
				'Do you have an official certification?',
				'carbon-txt'
			) }
			initialOpen={ schemes.length > 0 }
		>
			<VStack spacing={ 4 }>
				<Text>
					{ __(
						'Add a certification scheme (like a B Corp or an ecolabel) and its website. Schemes are defined once here; disclosures can then link to them.',
						'carbon-txt'
					) }
				</Text>

				{ schemes.map( ( scheme, index ) => (
					<Card key={ index }>
						<CardHeader>
							{ /* h2 semantics at the level-3 size, so the
							appearance doesn't change. */ }
							<Heading as="h2" level={ 3 }>
								{ sprintf(
									/* translators: %d: certification scheme number. */
									__(
										'Certification scheme %d',
										'carbon-txt'
									),
									index + 1
								) }
							</Heading>
							<Button
								isDestructive
								variant="tertiary"
								onClick={ () => removeScheme( index ) }
								size="small"
							>
								{ __( 'Remove', 'carbon-txt' ) }
							</Button>
						</CardHeader>
						<CardBody>
							<VStack spacing={ 4 }>
								<div
									style={ {
										display: 'grid',
										gridTemplateColumns:
											'repeat( auto-fit, minmax( 240px, 1fr ) )',
										gap: '24px',
									} }
								>
									<TextControl
										label={ __(
											'Title (required)',
											'carbon-txt'
										) }
										help={ __(
											'A short name for the scheme, e.g. B Corp. Used as its unique identifier in carbon.txt.',
											'carbon-txt'
										) }
										value={ scheme.title || '' }
										onChange={ ( title ) =>
											updateScheme( index, { title } )
										}
										__next40pxDefaultSize
										__nextHasNoMarginBottom
									/>
									<TextControl
										label={ __( 'URL', 'carbon-txt' ) }
										help={ __(
											'Where the certification’s requirements and verifying organisation are described.',
											'carbon-txt'
										) }
										type="url"
										placeholder="https://example.com/certification"
										value={ scheme.url || '' }
										onChange={ ( url ) =>
											updateScheme( index, { url } )
										}
										__next40pxDefaultSize
										__nextHasNoMarginBottom
									/>
								</div>
								<TextareaControl
									label={ __(
										'Description (optional)',
										'carbon-txt'
									) }
									value={ scheme.description || '' }
									onChange={ ( description ) =>
										updateScheme( index, { description } )
									}
									__nextHasNoMarginBottom
								/>
								{ ! ( scheme.title && scheme.title.trim() ) ||
								! ( scheme.url && scheme.url.trim() ) ? (
									<Notice
										status="warning"
										isDismissible={ false }
									>
										{ __(
											'This scheme needs a title and a URL to be included in your carbon.txt.',
											'carbon-txt'
										) }
									</Notice>
								) : null }
							</VStack>
						</CardBody>
					</Card>
				) ) }

				<Flex justify="flex-start">
					<FlexItem>
						<Button variant="secondary" onClick={ addScheme }>
							{ __( 'Add scheme', 'carbon-txt' ) }
						</Button>
					</FlexItem>
				</Flex>
			</VStack>
		</PanelBody>
	);
}

/**
 * A single editable disclosure.
 *
 * @param {{disclosure:Object,index:number,schemes:Array,onChange:Function,onRemove:Function}} props Props.
 */
function DisclosureRow( { disclosure, index, schemes, onChange, onRemove } ) {
	const [ mode, setMode ] = useState( modeFor( disclosure ) );

	// Start the optional-fields panel open when data is already there, so
	// previously saved values aren't hidden behind a collapsed panel.
	const hasOptionalFields =
		disclosure.domain ||
		disclosure.title ||
		disclosure.description ||
		disclosure.valid_until;

	const schemeId = disclosure.certification_schemes?.[ 0 ] || '';

	return (
		<Card>
			<CardHeader>
				<Heading as="h2" level={ 3 }>
					{ sprintf(
						/* translators: %d: disclosure number. */
						__( 'Disclosure %d', 'carbon-txt' ),
						index + 1
					) }
				</Heading>
				<Button
					isDestructive
					variant="tertiary"
					onClick={ onRemove }
					size="small"
				>
					{ __( 'Remove', 'carbon-txt' ) }
				</Button>
			</CardHeader>
			<CardBody>
				<VStack spacing={ 4 }>
					{ ! ( disclosure.url && disclosure.url.trim() ) && (
						<Notice status="warning" isDismissible={ false }>
							{ __(
								'This disclosure needs a URL, page, or file to be included in your carbon.txt.',
								'carbon-txt'
							) }
						</Notice>
					) }

					<SelectControl
						label={ __( 'Document type', 'carbon-txt' ) }
						value={ disclosure.doc_type || docTypes[ 0 ] }
						options={ docTypes.map( ( type ) => ( {
							value: type,
							label: DOC_TYPE_LABELS[ type ] || type,
						} ) ) }
						onChange={ ( doc_type ) => onChange( { doc_type } ) }
						__next40pxDefaultSize
						__nextHasNoMarginBottom
					/>

					{ schemes.length ? (
						<SelectControl
							label={ __( 'Certification scheme', 'carbon-txt' ) }
							help={ __(
								'The certification linked to this disclosure, from the “Do you have an official certification?” section.',
								'carbon-txt'
							) }
							value={ schemeId }
							options={ [
								{
									value: '',
									label: __( 'None', 'carbon-txt' ),
								},
								...schemes.map( ( scheme ) => ( {
									value: scheme.id,
									label: scheme.title || scheme.id,
								} ) ),
							] }
							onChange={ ( id ) =>
								onChange( {
									certification_schemes: id ? [ id ] : [],
								} )
							}
							__next40pxDefaultSize
							__nextHasNoMarginBottom
						/>
					) : (
						<Text variant="muted">
							{ __(
								'To link a certification to this disclosure, first add it under “Do you have an official certification?” above.',
								'carbon-txt'
							) }
						</Text>
					) }

					<ToggleGroupControl
						label={ __( 'URL source', 'carbon-txt' ) }
						value={ mode }
						onChange={ setMode }
						isBlock
						__next40pxDefaultSize
						__nextHasNoMarginBottom
					>
						<ToggleGroupControlOption
							value="page"
							label={ __( 'Select a page', 'carbon-txt' ) }
						/>
						<ToggleGroupControlOption
							value="media"
							label={ __( 'Choose a file', 'carbon-txt' ) }
						/>
						<ToggleGroupControlOption
							value="url"
							label={ __( 'Enter a URL', 'carbon-txt' ) }
						/>
					</ToggleGroupControl>

					{ 'url' === mode && (
						<TextControl
							label={ __( 'Disclosure URL', 'carbon-txt' ) }
							help={ __(
								'Add a custom URL to point to another place on your site or a page on someone else’s website',
								'carbon-txt'
							) }
							type="url"
							placeholder="https://example.com/sustainability"
							value={ disclosure.url || '' }
							onChange={ ( url ) =>
								onChange( {
									url,
									page_id: undefined,
									attachment_id: undefined,
								} )
							}
							__next40pxDefaultSize
							__nextHasNoMarginBottom
						/>
					) }

					{ 'page' === mode && (
						<PagePicker
							value={ disclosure.url || '' }
							pageId={ disclosure.page_id }
							onChange={ ( changes ) =>
								onChange( {
									...changes,
									attachment_id: undefined,
								} )
							}
						/>
					) }

					{ 'media' === mode && (
						<MediaPicker
							value={ disclosure.url || '' }
							attachmentId={ disclosure.attachment_id }
							help={ __(
								'Find a file in your site’s media library. It’s best to link to pdfs or structured data files',
								'carbon-txt'
							) }
							onChange={ ( changes ) =>
								onChange( { ...changes, page_id: undefined } )
							}
						/>
					) }

					<div
						style={ {
							// PanelBody only renders top/bottom borders; these
							// side borders close the rectangle.
							borderLeft: '1px solid #e0e0e0',
							borderRight: '1px solid #e0e0e0',
						} }
					>
						<PanelBody
							title={ __( 'Optional fields', 'carbon-txt' ) }
							initialOpen={ !! hasOptionalFields }
						>
							<div
								style={ {
									// Fixed rows: the short fields pair up; the textarea and
									// one-line domain span the full width, so no row mixes
									// short fields with tall ones.
									display: 'grid',
									gridTemplateColumns:
										'repeat( 2, minmax( 0, 1fr ) )',
									gap: '24px',
									alignItems: 'start',
								} }
							>
								<TextControl
									label={ __( 'Title', 'carbon-txt' ) }
									value={ disclosure.title || '' }
									onChange={ ( title ) =>
										onChange( { title } )
									}
									__next40pxDefaultSize
									__nextHasNoMarginBottom
								/>

								<div
									style={ {
										display: 'flex',
										gap: '8px',
										alignItems: 'end',
									} }
								>
									<TextControl
										label={ __(
											'Valid until',
											'carbon-txt'
										) }
										type="date"
										value={ disclosure.valid_until || '' }
										onChange={ ( valid_until ) =>
											onChange( { valid_until } )
										}
										__next40pxDefaultSize
										__nextHasNoMarginBottom
									/>

									{ disclosure.valid_until && (
										<Button
											variant="tertiary"
											size="small"
											onClick={ () =>
												onChange( { valid_until: '' } )
											}
											style={ { marginBottom: '8px' } }
										>
											{ __( 'Clear', 'carbon-txt' ) }
										</Button>
									) }
								</div>

								<div style={ { gridColumn: '1 / -1' } }>
									<TextareaControl
										label={ __(
											'Description',
											'carbon-txt'
										) }
										value={ disclosure.description || '' }
										onChange={ ( description ) =>
											onChange( { description } )
										}
										__nextHasNoMarginBottom
									/>
								</div>

								<div style={ { gridColumn: '1 / -1' } }>
									<TextControl
										label={ __( 'Domain', 'carbon-txt' ) }
										help={ __(
											'If your disclosure also applies to another website domain, you can add that here.',
											'carbon-txt'
										) }
										placeholder="example.com"
										value={ disclosure.domain || '' }
										onChange={ ( domain ) =>
											onChange( { domain } )
										}
										__next40pxDefaultSize
										__nextHasNoMarginBottom
									/>
								</div>
							</div>
						</PanelBody>
					</div>
				</VStack>
			</CardBody>
		</Card>
	);
}

/**
 * Main settings app.
 */
function App() {
	const [ settings, setSettings ] = useEntityProp(
		'root',
		'site',
		optionName
	);
	const [ notice, setNotice ] = useState( null );
	// A counter rather than a boolean: ExistingFileNotice needs to know
	// whether a save happened *after* a given import, not just whether
	// any save has ever succeeded.
	const [ saveCount, setSaveCount ] = useState( 0 );
	const [ backupCopied, setBackupCopied ] = useState( false );
	const [ backupCopyError, setBackupCopyError ] = useState( null );

	const { saveEditedEntityRecord } = useDispatch( coreStore );
	const isSaving = useSelect(
		( select ) =>
			select( coreStore ).isSavingEntityRecord( 'root', 'site' ),
		[]
	);

	const disclosures = settings?.disclosures || [];
	const schemes = settings?.certification_schemes || [];

	// Stable React keys for the rows, kept outside the saved data so the
	// REST schema (additionalProperties: false) never sees them. The list
	// is only mutated here (first render) and by the effect below — never
	// during render.
	const nextRowIdRef = useRef( 0 );
	const [ rowIds, setRowIds ] = useState( () =>
		disclosures.map( () => nextRowIdRef.current++ )
	);

	useEffect( () => {
		setRowIds( ( ids ) => {
			if ( ids.length === disclosures.length ) {
				return ids;
			}
			const next = ids.slice( 0, disclosures.length );
			while ( next.length < disclosures.length ) {
				next.push( nextRowIdRef.current++ );
			}
			return next;
		} );
	}, [ disclosures.length ] );

	const setDisclosures = ( next ) =>
		setSettings( { ...( settings || {} ), disclosures: next } );

	// Absent means opt-in: existing installs never stored this flag.
	const validateOnSave = settings?.validate_on_save !== false;
	const setValidateOnSave = ( next ) =>
		setSettings( { ...( settings || {} ), validate_on_save: next } );
	const [ moreValidation, setMoreValidation ] = useState( false );

	const updateDisclosure = ( index, changes ) =>
		setDisclosures(
			disclosures.map( ( d, i ) =>
				i === index ? { ...d, ...changes } : d
			)
		);

	const addDisclosure = () =>
		setDisclosures( [
			...disclosures,
			{ doc_type: docTypes[ 0 ], url: '' },
		] );

	const removeDisclosure = ( index ) =>
		setDisclosures( disclosures.filter( ( _, i ) => i !== index ) );

	// Scheme edits keep the preview consistent: when a row's derived id
	// changes (title re-typed), disclosure refs that pointed at the old id
	// follow it; refs to schemes that no longer exist are scrubbed.
	const updateSchemes = ( nextSchemes ) => {
		const renamed = {};
		if ( nextSchemes.length === schemes.length ) {
			schemes.forEach( ( scheme, i ) => {
				const nextId = nextSchemes[ i ]?.id;
				if ( scheme.id && nextId && scheme.id !== nextId ) {
					renamed[ scheme.id ] = nextId;
				}
			} );
		}
		const known = new Set(
			nextSchemes.map( ( s ) => s.id ).filter( Boolean )
		);
		setSettings( {
			...( settings || {} ),
			certification_schemes: nextSchemes,
			disclosures: disclosures.map( ( d ) =>
				d.certification_schemes?.some( ( id ) => ! known.has( id ) )
					? {
							...d,
							certification_schemes: d.certification_schemes
								.map( ( id ) => renamed[ id ] || id )
								.filter( ( id ) => known.has( id ) ),
					  }
					: d
			),
		} );
	};

	// Always exports the *current* on-screen disclosures (same content as
	// the Preview pane), not a server round trip — so it's accurate even
	// with unsaved edits, and needs no backend support of its own.
	const handleCopyBackup = async () => {
		setBackupCopyError( null );

		try {
			await copyToClipboard( renderCarbonTxt( disclosures, schemes ) );
			setBackupCopied( true );
			setTimeout( () => setBackupCopied( false ), 2000 );
		} catch ( error ) {
			setBackupCopyError(
				__(
					'Could not copy automatically — please select and copy the preview text manually.',
					'carbon-txt'
				)
			);
		}
	};

	const handleDownloadBackup = () => {
		const blob = new Blob( [ renderCarbonTxt( disclosures, schemes ) ], {
			type: 'text/plain',
		} );
		const url = URL.createObjectURL( blob );
		const link = document.createElement( 'a' );
		link.href = url;
		link.download = 'carbon.txt';
		link.click();
		URL.revokeObjectURL( url );
	};

	const importDisclosures = ( toImport, importedSchemes = [] ) => {
		const known = new Set( schemes.map( ( s ) => s.id ).filter( Boolean ) );
		const mergedSchemes = [ ...schemes ];
		importedSchemes.forEach( ( scheme ) => {
			if ( scheme?.id && scheme.url && ! known.has( scheme.id ) ) {
				known.add( scheme.id );
				mergedSchemes.push( scheme );
			}
		} );
		setSettings( {
			...( settings || {} ),
			disclosures: [ ...disclosures, ...toImport ],
			certification_schemes: mergedSchemes,
		} );
	};

	// Not awaited by save(): the Foundation's fetch can run the full
	// request timeout, and blocking the primary action on a third-party
	// round trip would make Save feel broken. Results stay off the UI —
	// the outcome is visible in the Foundation's dashboard only.
	const validateDomain = async () => {
		try {
			await apiFetch( {
				path: '/wp-carbon-txt/v1/validate-domain',
				method: 'POST',
			} );
		} catch {
			// Silent by design — see above.
		}
	};

	const save = async () => {
		setNotice( null );
		const saved = await saveEditedEntityRecord( 'root', 'site' );

		if ( saved ) {
			setSaveCount( ( count ) => count + 1 );
			setNotice( {
				status: 'success',
				text: __(
					'Saved. Your carbon.txt is up to date.',
					'carbon-txt'
				),
			} );

			if ( validateOnSave ) {
				validateDomain();
			}
			return;
		}

		// Read the store directly rather than via useSelect: we need the
		// value as of right now, not the one from the render that created
		// this closure.
		const lastError = dataSelect( coreStore ).getLastEntitySaveError(
			'root',
			'site',
			undefined
		);

		setNotice( {
			status: 'error',
			text: lastError?.message
				? sprintf(
						/* translators: %s: error message returned by the server. */
						__( 'Save failed: %s', 'carbon-txt' ),
						lastError.message
				  )
				: __( 'Save failed. Please try again.', 'carbon-txt' ),
		} );
	};

	return (
		<>
			<Heading level={ 1 }>{ __( 'Carbon.txt', 'carbon-txt' ) }</Heading>
			<Text>
				{ createInterpolateElement(
					__(
						'A carbon.txt file contains at least one disclosure, which is a link to a publicly available file typically sharing data reported in organisational sustainability reports. Find out more about <link>carbon.txt</link>.',
						'carbon-txt'
					),
					{
						link: (
							<ExternalLink href="https://carbontxt.org">
								{ __( 'carbon.txt', 'carbon-txt' ) }
							</ExternalLink>
						),
					}
				) }
			</Text>

			{ notice && (
				<div style={ { margin: '16px 0' } }>
					<Notice
						status={ notice.status }
						onRemove={ () => setNotice( null ) }
					>
						{ notice.text }
					</Notice>
				</div>
			) }

			<DnsRecordNotice dnsRecord={ initialDnsRecord } />

			{ initialExistingFile.exists && (
				<ExistingFileNotice
					location="root"
					initialFileInfo={ initialExistingFile }
					onImport={ importDisclosures }
					saveCount={ saveCount }
				/>
			) }

			{ initialWellKnownFile.exists && (
				<ExistingFileNotice
					location="well_known"
					initialFileInfo={ initialWellKnownFile }
					onImport={ importDisclosures }
					saveCount={ saveCount }
				/>
			) }

			<Flex align="stretch" gap={ 6 } style={ { marginTop: 16 } }>
				<FlexBlock>
					<VStack spacing={ 4 }>
						<Panel>
							<SchemesSection
								schemes={ schemes }
								onChange={ updateSchemes }
							/>
						</Panel>

						{ ! disclosures.length && (
							<Card>
								<CardBody>
									<Text>
										{ __(
											'No disclosures yet. Add your first document link to get started.',
											'carbon-txt'
										) }
									</Text>
								</CardBody>
							</Card>
						) }

						{ disclosures.map( ( disclosure, index ) => (
							<DisclosureRow
								key={ rowIds[ index ] ?? index }
								disclosure={ disclosure }
								index={ index }
								schemes={ schemes }
								onChange={ ( changes ) =>
									updateDisclosure( index, changes )
								}
								onRemove={ () => removeDisclosure( index ) }
							/>
						) ) }

						<Flex justify="flex-start">
							<FlexItem>
								<Button
									variant="secondary"
									onClick={ addDisclosure }
								>
									{ __( 'Add disclosure', 'carbon-txt' ) }
								</Button>
							</FlexItem>
						</Flex>
					</VStack>
				</FlexBlock>

				<FlexBlock>
					<div
						style={ {
							// The whole right column stays pinned while the
							// (often much taller) left column scrolls. The
							// wrapping FlexBlock must stretch for this to
							// have any travel, hence no `align` on the Flex.
							position: 'sticky',
							top: 'var(--wp-admin--admin-bar--height, 32px)',
						} }
					>
						<Card>
							<CardHeader>
								<Heading level={ 2 }>
									{ __( 'Preview', 'carbon-txt' ) }
								</Heading>
								<ExternalLink href={ carbonTxtUrl }>
									{ __( 'View live file', 'carbon-txt' ) }
								</ExternalLink>
							</CardHeader>
							<CardBody>
								<pre
									style={ {
										margin: 0,
										padding: 16,
										background: '#f6f7f7',
										borderRadius: 4,
										overflowX: 'auto',
										fontSize: 13,
										lineHeight: 1.6,
									} }
								>
									{ renderCarbonTxt( disclosures, schemes ) }
								</pre>
							</CardBody>
						</Card>

						<div style={ { marginTop: 16 } }>
							<Panel>
								<PanelBody
									title={ __(
										'Keep a copy of your disclosures',
										'carbon-txt'
									) }
									initialOpen={ false }
								>
									<VStack spacing={ 2 } alignment="left">
										<Text>
											{ __(
												"Deactivating will unpublish your site's carbon.txt file but keep it and your settings in case you reactivate. If you plan to delete the plugin your carbon.txt file will be lost - we recommend you save a copy of your file.",
												'carbon-txt'
											) }
										</Text>
										<Flex
											expanded={ false }
											justify="flex-start"
											gap={ 2 }
										>
											<Button
												variant="secondary"
												onClick={ handleCopyBackup }
											>
												{ backupCopied
													? __(
															'Copied!',
															'carbon-txt'
													  )
													: __(
															'Copy to clipboard',
															'carbon-txt'
													  ) }
											</Button>
											<Button
												variant="secondary"
												onClick={ handleDownloadBackup }
											>
												{ __(
													'Download file',
													'carbon-txt'
												) }
											</Button>
										</Flex>
										{ backupCopyError && (
											<Text
												style={ { color: '#cc1818' } }
											>
												{ backupCopyError }
											</Text>
										) }
									</VStack>
								</PanelBody>
							</Panel>
						</div>

						<VStack
							spacing={ 4 }
							alignment="left"
							style={ { marginTop: 16 } }
						>
							<Flex
								expanded={ false }
								justify="flex-start"
								align="center"
								gap={ 2 }
							>
								<CheckboxControl
									checked={ validateOnSave }
									onChange={ setValidateOnSave }
									label={ __(
										'Validate with the Green Web Foundation after saving.',
										'carbon-txt'
									) }
									__nextHasNoMarginBottom
								/>
								<Button
									variant="link"
									aria-expanded={ moreValidation }
									aria-controls="carbon-txt-validation-details"
									onClick={ () =>
										setMoreValidation( ! moreValidation )
									}
								>
									{ __(
										'More about validation',
										'carbon-txt'
									) }
								</Button>
							</Flex>
							{ moreValidation && (
								<Text
									variant="muted"
									style={ { fontSize: 12 } }
									id="carbon-txt-validation-details"
								>
									{ __(
										'They check that your disclosures resolve and the file follows the spec, and register your domain in your Green Web Foundation dashboard when it passes. Validation runs quietly after each save and never blocks publishing — your file goes live either way.',
										'carbon-txt'
									) }
								</Text>
							) }
							<Flex justify="flex-start">
								<Button
									variant="primary"
									onClick={ save }
									isBusy={ isSaving }
									disabled={ isSaving }
								>
									{ __( 'Save and publish', 'carbon-txt' ) }
								</Button>
							</Flex>
						</VStack>
					</div>
				</FlexBlock>
			</Flex>
		</>
	);
}

const root = document.getElementById( 'wp-carbon-txt-root' );
if ( root ) {
	createRoot( root ).render( <App /> );
}
