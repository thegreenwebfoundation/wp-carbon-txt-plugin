/**
 * Carbon.txt settings screen.
 */
import { createRoot, useState } from '@wordpress/element';
import { useEntityProp, store as coreStore } from '@wordpress/core-data';
import { useSelect, useDispatch } from '@wordpress/data';
import { __ } from '@wordpress/i18n';
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
	__experimentalToggleGroupControl as ToggleGroupControl,
	__experimentalToggleGroupControlOption as ToggleGroupControlOption,
	__experimentalHeading as Heading,
	__experimentalText as Text,
	__experimentalVStack as VStack,
} from '@wordpress/components';

const { optionName, docTypes, carbonTxtUrl, carbonTxtVersion } = window.wpCarbonTxt;

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
	return /^\d{4}-\d{2}-\d{2}$/.test( trimmed ) ? trimmed : tomlString( trimmed );
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
	if ( disclosure.domain ) {
		pairs.push( `domain = ${ tomlString( disclosure.domain ) }` );
	}
	if ( disclosure.title ) {
		pairs.push( `title = ${ tomlString( disclosure.title ) }` );
	}
	if ( disclosure.valid_until ) {
		pairs.push( `valid_until = ${ tomlDate( disclosure.valid_until ) }` );
	}
	return `{ ${ pairs.join( ', ' ) } }`;
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
			entries.map( ( d ) => '    ' + renderDisclosure( d ) + ',' ).join( '\n' ) +
			'\n]\n';
	}
	return out;
};

/**
 * Searchable published-page picker.
 *
 * @param {{value:string,onChange:Function}} props Props.
 */
function PagePicker( { value, onChange } ) {
	const [ search, setSearch ] = useState( '' );

	const pages = useSelect(
		( select ) =>
			select( coreStore ).getEntityRecords( 'postType', 'page', {
				per_page: 20,
				status: 'publish',
				search: search || undefined,
				orderby: search ? 'relevance' : 'title',
				order: search ? 'desc' : 'asc',
			} ),
		[ search ]
	);

	const options = ( pages || [] ).map( ( page ) => ( {
		value: page.link,
		label: page.title?.rendered || page.link,
	} ) );

	return (
		<ComboboxControl
			label={ __( 'Select a published page', 'wp-carbon-txt-plugin' ) }
			help={ __(
				'Search your pages by title. Its permalink is used as the disclosure URL.',
				'wp-carbon-txt-plugin'
			) }
			value={ value }
			options={ options }
			onFilterValueChange={ setSearch }
			onChange={ ( next ) => onChange( next || '' ) }
			__next40pxDefaultSize
		/>
	);
}

/**
 * A single editable disclosure.
 *
 * @param {{disclosure:Object,index:number,onChange:Function,onRemove:Function}} props Props.
 */
function DisclosureRow( { disclosure, index, onChange, onRemove } ) {
	const [ mode, setMode ] = useState( 'url' );

	return (
		<Card>
			<CardHeader>
				<Heading level={ 3 }>
					{ /* translators: %d: disclosure number. */ }
					{ __( 'Disclosure', 'wp-carbon-txt-plugin' ) + ' ' + ( index + 1 ) }
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
							label={ __( 'Enter a URL', 'wp-carbon-txt-plugin' ) }
						/>
						<ToggleGroupControlOption
							value="page"
							label={ __( 'Select a page', 'wp-carbon-txt-plugin' ) }
						/>
					</ToggleGroupControl>

					{ 'url' === mode ? (
						<TextControl
							label={ __( 'Disclosure URL', 'wp-carbon-txt-plugin' ) }
							type="url"
							placeholder="https://example.com/sustainability"
							value={ disclosure.url || '' }
							onChange={ ( url ) => onChange( { url } ) }
							__next40pxDefaultSize
							__nextHasNoMarginBottom
						/>
					) : (
						<PagePicker
							value={ disclosure.url || '' }
							onChange={ ( url ) => onChange( { url } ) }
						/>
					) }

					<TextControl
						label={ __( 'Title (optional)', 'wp-carbon-txt-plugin' ) }
						value={ disclosure.title || '' }
						onChange={ ( title ) => onChange( { title } ) }
						__next40pxDefaultSize
						__nextHasNoMarginBottom
					/>

					<TextControl
						label={ __( 'Domain (optional)', 'wp-carbon-txt-plugin' ) }
						help={ __(
							'The domain this document applies to, if different from your site.',
							'wp-carbon-txt-plugin'
						) }
						placeholder="example.com"
						value={ disclosure.domain || '' }
						onChange={ ( domain ) => onChange( { domain } ) }
						__next40pxDefaultSize
						__nextHasNoMarginBottom
					/>

					<TextControl
						label={ __( 'Valid until (optional)', 'wp-carbon-txt-plugin' ) }
						type="date"
						value={ disclosure.valid_until || '' }
						onChange={ ( valid_until ) => onChange( { valid_until } ) }
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
	const [ settings, setSettings ] = useEntityProp( 'root', 'site', optionName );
	const [ notice, setNotice ] = useState( null );

	const { saveEditedEntityRecord } = useDispatch( coreStore );
	const isSaving = useSelect(
		( select ) => select( coreStore ).isSavingEntityRecord( 'root', 'site' ),
		[]
	);

	const disclosures = settings?.disclosures || [];

	const setDisclosures = ( next ) =>
		setSettings( { ...( settings || {} ), disclosures: next } );

	const updateDisclosure = ( index, changes ) =>
		setDisclosures(
			disclosures.map( ( d, i ) => ( i === index ? { ...d, ...changes } : d ) )
		);

	const addDisclosure = () =>
		setDisclosures( [ ...disclosures, { doc_type: docTypes[ 0 ], url: '' } ] );

	const removeDisclosure = ( index ) =>
		setDisclosures( disclosures.filter( ( _, i ) => i !== index ) );

	const save = async () => {
		setNotice( null );
		await saveEditedEntityRecord( 'root', 'site' );
		setNotice( {
			status: 'success',
			text: __( 'Saved. Your carbon.txt is up to date.', 'wp-carbon-txt-plugin' ),
		} );
	};

	return (
		<>
			<Heading level={ 1 }>{ __( 'Carbon.txt', 'wp-carbon-txt-plugin' ) }</Heading>
			<Text>
				{ __(
					'Publish organisational sustainability disclosures at your site’s carbon.txt file.',
					'wp-carbon-txt-plugin'
				) }
			</Text>

			{ notice && (
				<div style={ { margin: '16px 0' } }>
					<Notice status={ notice.status } onRemove={ () => setNotice( null ) }>
						{ notice.text }
					</Notice>
				</div>
			) }

			<Flex align="flex-start" gap={ 6 } style={ { marginTop: 16 } }>
				<FlexBlock>
					<VStack spacing={ 4 }>
						{ disclosures.map( ( disclosure, index ) => (
							<DisclosureRow
								key={ index }
								disclosure={ disclosure }
								index={ index }
								onChange={ ( changes ) => updateDisclosure( index, changes ) }
								onRemove={ () => removeDisclosure( index ) }
							/>
						) ) }

						<Flex justify="space-between">
							<FlexItem>
								<Button variant="secondary" onClick={ addDisclosure }>
									{ __( 'Add disclosure', 'wp-carbon-txt-plugin' ) }
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
								{ __( 'View live file', 'wp-carbon-txt-plugin' ) }
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
				</FlexBlock>
			</Flex>
		</>
	);
}

const root = document.getElementById( 'wp-carbon-txt-root' );
if ( root ) {
	createRoot( root ).render( <App /> );
}
