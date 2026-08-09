import * as vscode from "vscode";

const TS_JS_LANGUAGES = new Set([
  "typescript",
  "typescriptreact",
  "javascript",
  "javascriptreact",
]);

/**
 * File-level Prism lenses (Blast Radius / Explore Ownership / Reveal on Map)
 * above line 0 of TS/JS files, gated behind `prism.codeLens.enabled` (default
 * on — M-057 P-B3). Lenses forward the document URI so the command handlers
 * resolve the same repo-relative path as the editor/explorer menus.
 */
export class PrismCodeLensProvider implements vscode.CodeLensProvider {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.emitter.event;

  refresh(): void {
    this.emitter.fire();
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (document.uri.scheme !== "file") return [];
    if (!TS_JS_LANGUAGES.has(document.languageId)) return [];
    const top = new vscode.Range(0, 0, 0, 0);
    return [
      new vscode.CodeLens(top, {
        title: "$(zap) Prism: Blast",
        command: "prism.blastRadius",
        arguments: [document.uri],
      }),
      new vscode.CodeLens(top, {
        title: "$(git-commit) Prism: Ownership",
        command: "prism.exploreOwnership",
        arguments: [document.uri],
      }),
      new vscode.CodeLens(top, {
        title: "$(map) Prism: Map",
        command: "prism.revealOnMap",
        arguments: [document.uri],
      }),
    ];
  }

  dispose(): void {
    this.emitter.dispose();
  }
}
