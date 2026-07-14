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
 * Mirror of the PHP renderer for the live preview.
 *
 * @param {{doc_type:string,url:string}} settings Setting value.
 * @return {string} carbon.txt body.
 */
const renderCarbonTxt = ( { doc_type: docType, url } ) => {
	let out = `version = "${ carbonTxtVersion }"\n\n[org]\n`;
	if ( ! url ) {
		out += 'disclosures = []\n';
	} else {
		out += `disclosures = [\n    { doc_type = ${ tomlString(
			docType
		) }, url = ${ tomlString( url ) } },\n]\n`;
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
 * Main settings app.
 */
function App() {
	const [ settings, setSettings ] = useEntityProp( 'root', 'site', optionName );
	const [ mode, setMode ] = useState( 'url' );
	const [ notice, setNotice ] = useState( null );

	const { saveEditedEntityRecord } = useDispatch( coreStore );
	const isSaving = useSelect(
		( select ) =>
			select( coreStore ).isSavingEntityRecord( 'root', 'site' ),
		[]
	);

	// The setting can be undefined during the initial load.
	const value = settings || { doc_type: docTypes[ 0 ], url: '' };

	const update = ( changes ) => setSettings( { ...value, ...changes } );

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
					'Publish an organisational sustainability disclosure at your site’s carbon.txt file.',
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

			<Flex align="flex-start" gap={ 6 } style={ { marginTop: 16 } }>
				<FlexBlock>
					<Card>
						<CardHeader>
							<Heading level={ 2 }>
								{ __( 'Disclosure', 'wp-carbon-txt-plugin' ) }
							</Heading>
						</CardHeader>
						<CardBody>
							<SelectControl
								label={ __( 'Document type', 'wp-carbon-txt-plugin' ) }
								value={ value.doc_type }
								options={ docTypes.map( ( type ) => ( {
									value: type,
									label: DOC_TYPE_LABELS[ type ] || type,
								} ) ) }
								onChange={ ( doc_type ) => update( { doc_type } ) }
								__next40pxDefaultSize
								__nextHasNoMarginBottom
							/>

							<div style={ { margin: '16px 0' } }>
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
							</div>

							{ 'url' === mode ? (
								<TextControl
									label={ __( 'Disclosure URL', 'wp-carbon-txt-plugin' ) }
									type="url"
									placeholder="https://example.com/sustainability"
									value={ value.url }
									onChange={ ( url ) => update( { url } ) }
									__next40pxDefaultSize
									__nextHasNoMarginBottom
								/>
							) : (
								<PagePicker
									value={ value.url }
									onChange={ ( url ) => update( { url } ) }
								/>
							) }

							<div style={ { marginTop: 24 } }>
								<Button
									variant="primary"
									onClick={ save }
									isBusy={ isSaving }
									disabled={ isSaving }
								>
									{ __( 'Save', 'wp-carbon-txt-plugin' ) }
								</Button>
							</div>
						</CardBody>
					</Card>
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
								{ renderCarbonTxt( value ) }
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
