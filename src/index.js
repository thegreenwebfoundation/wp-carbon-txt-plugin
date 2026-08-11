/**
 * Carbon.txt settings screen.
 */
import { createRoot, useState, useRef, useEffect } from '@wordpress/element';
import { useEntityProp, store as coreStore } from '@wordpress/core-data';
import { useSelect, useDispatch, select as dataSelect } from '@wordpress/data';
import { useDebounce } from '@wordpress/compose';
import apiFetch from '@wordpress/api-fetch';
import { __, sprintf } from '@wordpress/i18n';
import {
	Card,
	CardBody,
	CardHeader,
	Flex,
	FlexBlock,
	FlexItem,
	SelectControl,
	TextControl,
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
			'wp-carbon-txt-plugin'
		),
		explanation: __(
			'Depending on your hosting configuration, your web server may keep serving that file directly instead of the version this plugin generates — saving here might not change what visitors see until the existing file is removed or renamed.',
			'wp-carbon-txt-plugin'
		),
		spokenMessage: __(
			'An existing carbon.txt file was found on your server.',
			'wp-carbon-txt-plugin'
		),
	},
	well_known: {
		intro: __(
			'A carbon.txt file was also found at the well-known location:',
			'wp-carbon-txt-plugin'
		),
		explanation: __(
			'A file at your domain root takes priority over this location, so it will typically be ignored as long as your root carbon.txt is reachable — you may still want to review or remove it to avoid confusion.',
			'wp-carbon-txt-plugin'
		),
		spokenMessage: __(
			'A carbon.txt file was found at the well-known location.',
			'wp-carbon-txt-plugin'
		),
	},
};

const DOC_TYPE_LABELS = {
	'web-page': __( 'Web page', 'wp-carbon-txt-plugin' ),
	'annual-report': __( 'Annual report', 'wp-carbon-txt-plugin' ),
	'sustainability-page': __( 'Sustainability page', 'wp-carbon-txt-plugin' ),
	certificate: __( 'Certificate', 'wp-carbon-txt-plugin' ),
	'csrd-report': __( 'CSRD report', 'wp-carbon-txt-plugin' ),
	'ai-model-card': __( 'AI model card', 'wp-carbon-txt-plugin' ),
	other: __( 'Other', 'wp-carbon-txt-plugin' ),
};

/**
 * Encode a value as a TOML basic string.
 *
 * @param {string} value Value.
 * @return {string} Quoted string.
 */
const tomlString = ( value ) =>
	'"' + String( value ).replace( /\\/g, '\\\\' ).replace( /"/g, '\\"' ) + '"';

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
	if ( disclosure.valid_until ) {
		pairs.push( `valid_until = ${ tomlDate( disclosure.valid_until ) }` );
	}
	if ( disclosure.domain ) {
		pairs.push( `domain = ${ tomlString( disclosure.domain ) }` );
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
 * Mirror of the PHP renderer for the live preview.
 *
 * @param {Array} disclosures Disclosure list.
 * @return {string} carbon.txt body.
 */
const renderCarbonTxt = ( disclosures ) => {
	const entries = disclosures.filter(
		( disclosure ) => disclosure.url && disclosure.url.trim()
	);

	let out = `version = "${ carbonTxtVersion }"\n\n[org]\n`;
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
			label={ __( 'Select a published page', 'wp-carbon-txt-plugin' ) }
			help={ __(
				'Search your pages by title. Its permalink is used as the disclosure URL.',
				'wp-carbon-txt-plugin'
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
 */
function MediaPicker( { value, attachmentId, onChange } ) {
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
			title: __( 'Select a file', 'wp-carbon-txt-plugin' ),
			button: { text: __( 'Use this file', 'wp-carbon-txt-plugin' ) },
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
							__( 'Selected file: %s', 'wp-carbon-txt-plugin' ),
							label
					  )
					: __( 'No file selected yet.', 'wp-carbon-txt-plugin' ) }
			</Text>
			<Button variant="secondary" onClick={ openMediaLibrary }>
				{ value
					? __( 'Choose a different file', 'wp-carbon-txt-plugin' )
					: __( 'Choose a file', 'wp-carbon-txt-plugin' ) }
			</Button>
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
					'wp-carbon-txt-plugin'
				) }
			>
				<VStack spacing={ 2 } alignment="left">
					<Text>
						{ __(
							'A DNS TXT record on your domain delegates carbon.txt discovery to:',
							'wp-carbon-txt-plugin'
						) }{ ' ' }
						<code>{ dnsRecord.location }</code>
					</Text>
					<Text>
						{ __(
							'A DNS record takes priority over any file this plugin generates — visitors and validators will follow it instead. If that’s intentional, no action is needed; otherwise, review or remove the carbon-txt-location TXT record on your domain so this plugin’s file is used.',
							'wp-carbon-txt-plugin'
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
					__(
						'Could not delete the existing file.',
						'wp-carbon-txt-plugin'
					)
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
		onImport( fileInfo.disclosures );
		setHasImported( true );
		setSaveCountAtImport( saveCount );
	};

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
										'This file uses carbon.txt version %1$s. Importing will bring it up to version %2$s, the version this plugin generates.',
										'wp-carbon-txt-plugin'
									),
									fileInfo.file_version,
									carbonTxtVersion
								) }
							</Text>
						) }

					{ canImport && fileInfo.disclosures.length > 0 && (
						<Button variant="secondary" onClick={ handleImport }>
							{ sprintf(
								/* translators: %d: number of disclosures found in the existing file. */
								__(
									'Import %d disclosure(s) from this file',
									'wp-carbon-txt-plugin'
								),
								fileInfo.disclosures.length
							) }
						</Button>
					) }

					{ hasImported && (
						<Text>
							{ isDeleting
								? __(
										'Removing the old file…',
										'wp-carbon-txt-plugin'
								  )
								: __(
										'Imported. Once you save, this file will be permanently deleted — its data now lives in your plugin settings.',
										'wp-carbon-txt-plugin'
								  ) }
						</Text>
					) }

					{ fileInfo.unsupported_version && (
						<Text>
							{ sprintf(
								/* translators: %s: carbon.txt syntax version found in the file. */
								__(
									'This file uses carbon.txt version %s, which is newer than this plugin supports. Update the plugin, then reload this page to import it.',
									'wp-carbon-txt-plugin'
								),
								fileInfo.unsupported_version
							) }
						</Text>
					) }

					{ ! fileInfo.disclosures.length && fileInfo.raw && (
						<details>
							<summary>
								{ fileInfo.unsupported_version
									? __(
											'View the raw file',
											'wp-carbon-txt-plugin'
									  )
									: __(
											"We couldn't automatically read its disclosures — view the raw file",
											'wp-carbon-txt-plugin'
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
								'Delete existing file so this plugin is used',
								'wp-carbon-txt-plugin'
							) }
						</Button>
					) }

					{ canDelete && confirming && (
						<VStack spacing={ 2 } alignment="left">
							<Text>
								{ __(
									'This cannot be undone. Continue?',
									'wp-carbon-txt-plugin'
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
									{ __(
										'Yes, delete it',
										'wp-carbon-txt-plugin'
									) }
								</Button>
								<Button
									variant="tertiary"
									disabled={ isDeleting }
									onClick={ () => setConfirming( false ) }
								>
									{ __( 'Cancel', 'wp-carbon-txt-plugin' ) }
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
 * which internal id field (if any) is set.
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
	return 'url';
};

/**
 * A single editable disclosure.
 *
 * @param {{disclosure:Object,index:number,onChange:Function,onRemove:Function}} props Props.
 */
function DisclosureRow( { disclosure, index, onChange, onRemove } ) {
	const [ mode, setMode ] = useState( modeFor( disclosure ) );

	return (
		<Card>
			<CardHeader>
				<Heading level={ 3 }>
					{ sprintf(
						/* translators: %d: disclosure number. */
						__( 'Disclosure %d', 'wp-carbon-txt-plugin' ),
						index + 1
					) }
				</Heading>
				<Button
					isDestructive
					variant="tertiary"
					onClick={ onRemove }
					size="small"
				>
					{ __( 'Remove', 'wp-carbon-txt-plugin' ) }
				</Button>
			</CardHeader>
			<CardBody>
				<VStack spacing={ 4 }>
					{ ! ( disclosure.url && disclosure.url.trim() ) && (
						<Notice status="warning" isDismissible={ false }>
							{ __(
								'This disclosure needs a URL, page, or file to be included in your carbon.txt.',
								'wp-carbon-txt-plugin'
							) }
						</Notice>
					) }

					<SelectControl
						label={ __( 'Document type', 'wp-carbon-txt-plugin' ) }
						value={ disclosure.doc_type || docTypes[ 0 ] }
						options={ docTypes.map( ( type ) => ( {
							value: type,
							label: DOC_TYPE_LABELS[ type ] || type,
						} ) ) }
						onChange={ ( doc_type ) => onChange( { doc_type } ) }
						__next40pxDefaultSize
						__nextHasNoMarginBottom
					/>

					<TextControl
						label={ __(
							'Domain (optional)',
							'wp-carbon-txt-plugin'
						) }
						help={ __(
							'The domain this disclosure applies to, if this carbon.txt covers multiple domains.',
							'wp-carbon-txt-plugin'
						) }
						placeholder="example.com"
						value={ disclosure.domain || '' }
						onChange={ ( domain ) => onChange( { domain } ) }
						__next40pxDefaultSize
						__nextHasNoMarginBottom
					/>

					<ToggleGroupControl
						label={ __( 'URL source', 'wp-carbon-txt-plugin' ) }
						value={ mode }
						onChange={ setMode }
						isBlock
						__next40pxDefaultSize
						__nextHasNoMarginBottom
					>
						<ToggleGroupControlOption
							value="url"
							label={ __(
								'Enter a URL',
								'wp-carbon-txt-plugin'
							) }
						/>
						<ToggleGroupControlOption
							value="page"
							label={ __(
								'Select a page',
								'wp-carbon-txt-plugin'
							) }
						/>
						<ToggleGroupControlOption
							value="media"
							label={ __(
								'Choose a file',
								'wp-carbon-txt-plugin'
							) }
						/>
					</ToggleGroupControl>

					{ 'url' === mode && (
						<TextControl
							label={ __(
								'Disclosure URL',
								'wp-carbon-txt-plugin'
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
							onChange={ ( changes ) =>
								onChange( { ...changes, page_id: undefined } )
							}
						/>
					) }

					<TextControl
						label={ __(
							'Title (optional)',
							'wp-carbon-txt-plugin'
						) }
						value={ disclosure.title || '' }
						onChange={ ( title ) => onChange( { title } ) }
						__next40pxDefaultSize
						__nextHasNoMarginBottom
					/>

					<TextControl
						label={ __(
							'Valid until (optional)',
							'wp-carbon-txt-plugin'
						) }
						type="date"
						value={ disclosure.valid_until || '' }
						onChange={ ( valid_until ) =>
							onChange( { valid_until } )
						}
						__next40pxDefaultSize
						__nextHasNoMarginBottom
					/>
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

	// Stable React keys for the rows, kept outside the saved data so the
	// REST schema (additionalProperties: false) never sees them.
	const rowIdsRef = useRef( { next: 1, list: [] } );
	const rowIds = rowIdsRef.current.list;
	while ( rowIds.length < disclosures.length ) {
		rowIds.push( rowIdsRef.current.next++ );
	}
	rowIds.length = disclosures.length;

	const setDisclosures = ( next ) =>
		setSettings( { ...( settings || {} ), disclosures: next } );

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

	const removeDisclosure = ( index ) => {
		rowIds.splice( index, 1 );
		setDisclosures( disclosures.filter( ( _, i ) => i !== index ) );
	};

	// Always exports the *current* on-screen disclosures (same content as
	// the Preview pane), not a server round trip — so it's accurate even
	// with unsaved edits, and needs no backend support of its own.
	const handleCopyBackup = async () => {
		setBackupCopyError( null );

		try {
			await copyToClipboard( renderCarbonTxt( disclosures ) );
			setBackupCopied( true );
			setTimeout( () => setBackupCopied( false ), 2000 );
		} catch ( error ) {
			setBackupCopyError(
				__(
					'Could not copy automatically — please select and copy the preview text manually.',
					'wp-carbon-txt-plugin'
				)
			);
		}
	};

	const handleDownloadBackup = () => {
		const blob = new Blob( [ renderCarbonTxt( disclosures ) ], {
			type: 'text/plain',
		} );
		const url = URL.createObjectURL( blob );
		const link = document.createElement( 'a' );
		link.href = url;
		link.download = 'carbon.txt';
		link.click();
		URL.revokeObjectURL( url );
	};

	const importDisclosures = ( toImport ) =>
		setDisclosures( [ ...disclosures, ...toImport ] );

	const save = async () => {
		setNotice( null );
		const saved = await saveEditedEntityRecord( 'root', 'site' );

		if ( saved ) {
			setSaveCount( ( count ) => count + 1 );
			setNotice( {
				status: 'success',
				text: __(
					'Saved. Your carbon.txt is up to date.',
					'wp-carbon-txt-plugin'
				),
			} );
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
						__( 'Saving failed: %s', 'wp-carbon-txt-plugin' ),
						lastError.message
				  )
				: __(
						'Saving failed. Please try again.',
						'wp-carbon-txt-plugin'
				  ),
		} );
	};

	return (
		<>
			<Heading level={ 1 }>
				{ __( 'Carbon.txt', 'wp-carbon-txt-plugin' ) }
			</Heading>
			<Text>
				{ __(
					'Publish organisational sustainability disclosures at your site’s carbon.txt file.',
					'wp-carbon-txt-plugin'
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

			<Flex align="flex-start" gap={ 6 } style={ { marginTop: 16 } }>
				<FlexBlock>
					<VStack spacing={ 4 }>
						{ ! disclosures.length && (
							<Card>
								<CardBody>
									<Text>
										{ __(
											'No disclosures yet. Add your first sustainability document to publish it in your carbon.txt.',
											'wp-carbon-txt-plugin'
										) }
									</Text>
								</CardBody>
							</Card>
						) }

						{ disclosures.map( ( disclosure, index ) => (
							<DisclosureRow
								key={ rowIds[ index ] }
								disclosure={ disclosure }
								index={ index }
								onChange={ ( changes ) =>
									updateDisclosure( index, changes )
								}
								onRemove={ () => removeDisclosure( index ) }
							/>
						) ) }

						<Flex justify="space-between">
							<FlexItem>
								<Button
									variant="secondary"
									onClick={ addDisclosure }
								>
									{ __(
										'Add disclosure',
										'wp-carbon-txt-plugin'
									) }
								</Button>
							</FlexItem>
							<FlexItem>
								<Button
									variant="primary"
									onClick={ save }
									isBusy={ isSaving }
									disabled={ isSaving }
								>
									{ __( 'Save', 'wp-carbon-txt-plugin' ) }
								</Button>
							</FlexItem>
						</Flex>
					</VStack>
				</FlexBlock>

				<FlexBlock>
					<Card>
						<CardHeader>
							<Heading level={ 2 }>
								{ __( 'Preview', 'wp-carbon-txt-plugin' ) }
							</Heading>
							<ExternalLink href={ carbonTxtUrl }>
								{ __(
									'View live file',
									'wp-carbon-txt-plugin'
								) }
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
								{ renderCarbonTxt( disclosures ) }
							</pre>
						</CardBody>
					</Card>

					<div style={ { marginTop: 16 } }>
						<Panel>
							<PanelBody
								title={ __(
									'Keep a copy of your disclosures',
									'wp-carbon-txt-plugin'
								) }
								initialOpen={ false }
							>
								<VStack spacing={ 2 } alignment="left">
									<Text>
										{ __(
											'Removing this plugin also removes its saved settings. Save a copy of your current disclosures if you ever plan to deactivate or delete it.',
											'wp-carbon-txt-plugin'
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
														'wp-carbon-txt-plugin'
												  )
												: __(
														'Copy to clipboard',
														'wp-carbon-txt-plugin'
												  ) }
										</Button>
										<Button
											variant="secondary"
											onClick={ handleDownloadBackup }
										>
											{ __(
												'Download file',
												'wp-carbon-txt-plugin'
											) }
										</Button>
									</Flex>
									{ backupCopyError && (
										<Text style={ { color: '#cc1818' } }>
											{ backupCopyError }
										</Text>
									) }
								</VStack>
							</PanelBody>
						</Panel>
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
