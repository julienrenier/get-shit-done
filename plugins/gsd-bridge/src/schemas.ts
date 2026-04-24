/**
 * Shared form/elicitation schema types for gsd-bridge.
 *
 * The MCP server generates RequestedSchema JSON on the fly; the browser
 * renders a form directly from the schema. One formalism for all questions
 * (D-09 per .planning/phases/01-webview-bidirectionel/01-CONTEXT.md).
 */

export type ElicitAction = 'accept' | 'decline' | 'cancel';

export interface FieldSchema {
  type: 'string' | 'number' | 'boolean' | 'enum';
  title: string;
  description?: string;
  required?: boolean;
  enum?: readonly string[];
}

export interface FormSchema {
  mode: 'form';
  title: string;
  fields: Record<string, FieldSchema>;
}

export interface UrlSchema {
  mode: 'url';
  url: string;
}

export type RequestedSchema = FormSchema | UrlSchema;

export interface ElicitResponse {
  action: ElicitAction;
  content?: Record<string, unknown>;
}
