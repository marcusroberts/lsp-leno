/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import {
	createConnection,
	Range,
	Position,
	Command,
	TextEdit,
	TextDocuments,
	Diagnostic,
	DiagnosticSeverity,
	ProposedFeatures,
	InitializeParams,
	DidChangeConfigurationNotification,
	CompletionItem,
	CompletionItemKind,
	TextDocumentPositionParams,
	TextDocumentSyncKind,
	InitializeResult,
	DocumentDiagnosticReportKind,
	type DocumentDiagnosticReport
} from 'vscode-languageserver/node';

import {
	TextDocument
} from 'vscode-languageserver-textdocument';

import { readFile }  from 'node:fs/promises';
import { WASI }  from 'node:wasi';
import { argv, env } from 'node:process';

// let dv = new DataView(new ArrayBuffer());
// const dataView = mem => dv.buffer === mem.buffer ? dv : dv = new DataView(mem.buffer);

const wasi = new WASI({
	version:'preview1',
    args: argv,
    env,
  });

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

let dv = new DataView(new ArrayBuffer(0));
const dataView = (mem:WebAssembly.Memory) => dv.buffer === mem.buffer ? dv : dv = new DataView(mem.buffer);
let instance:WebAssembly.Instance;
let wasm;

const utf8Decoder = new TextDecoder();
const utf8Encoder = new TextEncoder();
let utf8EncodedLen = 0;


const utf8Encode = (s:string, realloc:any, memory:WebAssembly.Memory) => {
	if (typeof s !== 'string') throw new TypeError('expected a string');
	if (s.length === 0) {
		utf8EncodedLen = 0;
		return 1;
	}
	const buf = utf8Encoder.encode(s);
	const ptr = realloc(0, 0, 1, buf.length);
	new Uint8Array(memory.buffer).set(buf, ptr);
	utf8EncodedLen = buf.length;
	return ptr;
};

function getlenses(arg0:string,exports0:WebAssembly.Exports,memory0:WebAssembly.Memory,realloc0:WebAssembly.ExportValue) {
    const ptr0 = utf8Encode(arg0, realloc0, memory0);
    const len0 = utf8EncodedLen;
    const fn = exports0['leno:lsp/lenses#getlenses'] as (arg0:number,arg1:number) => number;
	const ret = fn(ptr0, len0);
    const len3 = dataView(memory0).getInt32(ret + 4, true);
    const base3 = dataView(memory0).getInt32(ret + 0, true);
    const result3 = [];
    for (let i = 0; i < len3; i++) {
      const base = base3 + i * 32;
      const ptr1 = dataView(memory0).getInt32(base + 16, true);
      const len1 = dataView(memory0).getInt32(base + 20, true);
      const result1 = utf8Decoder.decode(new Uint8Array(memory0.buffer, ptr1, len1));
      const ptr2 = dataView(memory0).getInt32(base + 24, true);
      const len2 = dataView(memory0).getInt32(base + 28, true);
      const result2 = utf8Decoder.decode(new Uint8Array(memory0.buffer, ptr2, len2));
      result3.push({
        range: {
          start: {
            line: dataView(memory0).getInt32(base + 0, true) >>> 0,
            character: dataView(memory0).getInt32(base + 4, true) >>> 0,
          },
          end: {
            line: dataView(memory0).getInt32(base + 8, true) >>> 0,
            character: dataView(memory0).getInt32(base + 12, true) >>> 0,
          },
        },
        command: {
          title: result1,
          command: result2,
        },
      });
    }
    return result3;
  }

  function format(arg0:string,exports0:WebAssembly.Exports,memory0:WebAssembly.Memory,realloc0:WebAssembly.ExportValue) {
	const ptr0 = utf8Encode(arg0, realloc0, memory0);
	const len0 = utf8EncodedLen;
//	const ret = exports0['leno:lsp/lenses#format'](ptr0, len0);

	const fn = exports0['leno:lsp/lenses#format'] as (arg0:number,arg1:number) => number;
	const ret = fn(ptr0, len0);
	const ptr1 = dataView(memory0).getInt32(ret + 0, true);
	const len1 = dataView(memory0).getInt32(ret + 4, true);
	const result1 = utf8Decoder.decode(new Uint8Array(memory0.buffer, ptr1, len1));
	return result1;
  }

connection.onInitialize(async (params: InitializeParams) => {
	const capabilities = params.capabilities;

	console.log("@@@@ cwd",process.cwd());

	wasm = await WebAssembly.compile(
		await readFile('/Users/marcus/Projects/lsp-leno/server/lenolsp.gr.wasm') 
	);

	const importObject = { wasi_snapshot_preview1: wasi.wasiImport };
    instance = await WebAssembly.instantiate(wasm, importObject);  // wasi.getImportObject()
	const { memory } = instance.exports;
    wasi.start(instance);
	

	// Does the client support the `workspace/configuration` request?
	// If not, we fall back using global settings.
	hasConfigurationCapability = !!(
		capabilities.workspace && !!capabilities.workspace.configuration
	);
	hasWorkspaceFolderCapability = !!(
		capabilities.workspace && !!capabilities.workspace.workspaceFolders
	);
	hasDiagnosticRelatedInformationCapability = !!(
		capabilities.textDocument &&
		capabilities.textDocument.publishDiagnostics &&
		capabilities.textDocument.publishDiagnostics.relatedInformation
	);

	const result: InitializeResult = {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Incremental,
			// Tell the client that this server supports code completion.
			completionProvider: {
				resolveProvider: true
			},
			codeLensProvider: {
				resolveProvider:false
			},
			documentFormattingProvider: true,
			diagnosticProvider: {
				interFileDependencies: false,
				workspaceDiagnostics: false
			}
		}
	};
	if (hasWorkspaceFolderCapability) {
		result.capabilities.workspace = {
			workspaceFolders: {
				supported: true
			}
		};
	}
	return result;
});

connection.onInitialized(() => {
	if (hasConfigurationCapability) {
		// Register for all configuration changes.
		connection.client.register(DidChangeConfigurationNotification.type, undefined);
	}
	if (hasWorkspaceFolderCapability) {
		connection.workspace.onDidChangeWorkspaceFolders(_event => {
			connection.console.log('Workspace folder change event received.');
		});
	}
});

// The example settings
interface ExampleSettings {
	maxNumberOfProblems: number;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: ExampleSettings = { maxNumberOfProblems: 1000 };
let globalSettings: ExampleSettings = defaultSettings;

// Cache the settings of all open documents
const documentSettings: Map<string, Thenable<ExampleSettings>> = new Map();

connection.onDidChangeConfiguration(change => {
	if (hasConfigurationCapability) {
		// Reset all cached document settings
		documentSettings.clear();
	} else {
		globalSettings = <ExampleSettings>(
			(change.settings.languageServerExample || defaultSettings)
		);
	}
	// Refresh the diagnostics since the `maxNumberOfProblems` could have changed.
	// We could optimize things here and re-fetch the setting first can compare it
	// to the existing setting, but this is out of scope for this example.
	connection.languages.diagnostics.refresh();
});

function getDocumentSettings(resource: string): Thenable<ExampleSettings> {
	if (!hasConfigurationCapability) {
		return Promise.resolve(globalSettings);
	}
	let result = documentSettings.get(resource);
	if (!result) {
		result = connection.workspace.getConfiguration({
			scopeUri: resource,
			section: 'lenoLanguageServer'
		});
		documentSettings.set(resource, result);
	}
	return result;
}

// Only keep settings for open documents
documents.onDidClose(e => {
	documentSettings.delete(e.document.uri);
});


connection.onCodeLens((params) => {
	console.log("onCodeLens",params);

	const document = documents.get(params.textDocument.uri);

	if (document !== undefined) {


		console.log("document",document);


	const { memory } = instance.exports;
	const realloc = instance.exports.cabi_realloc;

	const text = document.getText();

	console.log("text",text);

    const result0 = getlenses(text,instance.exports, memory as WebAssembly.Memory, realloc);
	return result0;
	} else {
		return [];
	}
	
});

connection.onCodeLensResolve((codeLens) => {
	console.log("onCodeLensResolve",codeLens);
	codeLens.command = Command.create('My Code Lens', 'commandId');
	return codeLens;
});



connection.languages.diagnostics.on(async (params) => {
	const document = documents.get(params.textDocument.uri);
	console.log("Document",document);
	if (document !== undefined) {
		return {
			kind: DocumentDiagnosticReportKind.Full,
			items: [] //await validateTextDocument(document)
		} satisfies DocumentDiagnosticReport;
	} else {
		// We don't know the document. We can either try to read it from disk
		// or we don't report problems for it.
		return {
			kind: DocumentDiagnosticReportKind.Full,
			items: []
		} satisfies DocumentDiagnosticReport;
	}
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(change => {
	validateTextDocument(change.document);
});

async function validateTextDocument(textDocument: TextDocument): Promise<Diagnostic[]> {
	// In this simple example we get the settings for every validate run.
	const settings = await getDocumentSettings(textDocument.uri);

	// The validator creates diagnostics for all uppercase words length 2 and more
	const text = textDocument.getText();
	const pattern = /\b[A-Z]{2,}\b/g;
	let m: RegExpExecArray | null;

	let problems = 0;
	const diagnostics: Diagnostic[] = [];
	while ((m = pattern.exec(text)) && problems < settings.maxNumberOfProblems) {
		problems++;
		const diagnostic: Diagnostic = {
			severity: DiagnosticSeverity.Warning,
			range: {
				start: textDocument.positionAt(m.index),
				end: textDocument.positionAt(m.index + m[0].length)
			},
			message: `${m[0]} is all uppercase.`,
			source: 'ex'
		};
		if (hasDiagnosticRelatedInformationCapability) {
			diagnostic.relatedInformation = [
				{
					location: {
						uri: textDocument.uri,
						range: Object.assign({}, diagnostic.range)
					},
					message: 'Spelling matters'
				},
				{
					location: {
						uri: textDocument.uri,
						range: Object.assign({}, diagnostic.range)
					},
					message: 'Particularly for names'
				}
			];
		}
		diagnostics.push(diagnostic);
	}
	return diagnostics;
}

connection.onDidChangeWatchedFiles(_change => {
	// Monitored files have change in VSCode
	connection.console.log('We received a file change event');
});

// This handler provides the initial list of the completion items.
connection.onCompletion(
	(_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
		// The pass parameter contains the position of the text document in
		// which code complete got requested. For the example we ignore this
		// info and always provide the same completion items.
		return [
			{
				label: 'TypeScript',
				kind: CompletionItemKind.Text,
				data: 1
			},
			{
				label: 'JavaScript',
				kind: CompletionItemKind.Text,
				data: 2
			}
		];
	}
);

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve(
	(item: CompletionItem): CompletionItem => {
		if (item.data === 1) {
			item.detail = 'TypeScript details';
			item.documentation = 'TypeScript documentation';
		} else if (item.data === 2) {
			item.detail = 'JavaScript details';
			item.documentation = 'JavaScript documentation';
		}
		return item;
	}
);

connection.onDocumentFormatting(params => {
	console.log("formatting",params);
	const document = documents.get(params.textDocument.uri);

	if (document !== undefined) {

		const text = document.getText();
		console.log("document to format",text);

		const { memory } = instance.exports;
		const realloc = instance.exports.cabi_realloc;

		const result0 = format(text,instance.exports, memory as WebAssembly.Memory, realloc);
		
		const editRange : Range = Range.create(Position.create(0, 0), document.positionAt(document.getText().length));
		return [TextEdit.replace(editRange, result0)];

	} 

	return undefined;

});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
