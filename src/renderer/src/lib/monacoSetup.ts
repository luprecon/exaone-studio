import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/language/json/json.worker?worker';
import CssWorker from 'monaco-editor/language/css/css.worker?worker';
import HtmlWorker from 'monaco-editor/language/html/html.worker?worker';
import TsWorker from 'monaco-editor/language/typescript/ts.worker?worker';

let initialized = false;

export function ensureMonacoSetup(): void {
  if (initialized) return;
  initialized = true;

  const globalScope = self as unknown as {
    MonacoEnvironment?: {
      getWorker: (_moduleId: string, label: string) => Worker;
    };
  };

  globalScope.MonacoEnvironment = {
    getWorker(_moduleId: string, label: string): Worker {
      if (label === 'json') return new JsonWorker();
      if (label === 'css' || label === 'scss' || label === 'less') {
        return new CssWorker();
      }
      if (label === 'html' || label === 'handlebars' || label === 'razor') {
        return new HtmlWorker();
      }
      if (label === 'typescript' || label === 'javascript') {
        return new TsWorker();
      }
      return new EditorWorker();
    }
  };

  loader.config({ monaco });
}
