import type { FastifyPluginAsync } from 'fastify';
import {
  serializeDocument,
  serializeDocumentSummary,
  serializeDocumentVersion,
} from './document-api.mapper.js';
import {
  applicationDocumentListResponseSchema,
  createDocumentRequestSchema,
  createDocumentVersionRequestSchema,
  documentIdentifierParamsSchema,
  documentResponseSchema,
  documentVersionListResponseSchema,
  updateDocumentMetadataRequestSchema,
} from './document.schemas.js';
import type { DocumentService } from './document.service.js';
import type {
  CreateDocumentInput,
  CreateDocumentVersionInput,
  UpdateDocumentMetadataInput,
} from './document.types.js';

export type DocumentRouteService = Pick<
  DocumentService,
  | 'createDocument'
  | 'getApplicationDocuments'
  | 'getDocument'
  | 'updateDocumentMetadata'
  | 'getDocumentVersions'
  | 'createDocumentVersion'
>;

export interface DocumentRoutesOptions {
  readonly resolveDocumentService: () => DocumentRouteService;
}

interface DocumentIdentifierParams {
  readonly id: string;
}

export const documentRoutes: FastifyPluginAsync<DocumentRoutesOptions> = async (
  app,
  options,
) => {
  app.get<{ Params: DocumentIdentifierParams }>(
    '/applications/:id/documents',
    {
      schema: {
        params: documentIdentifierParamsSchema,
        response: { 200: applicationDocumentListResponseSchema },
      },
    },
    async (request) => {
      const documents = await options
        .resolveDocumentService()
        .getApplicationDocuments(request.params.id);
      return { documents: documents.map(serializeDocumentSummary) };
    },
  );

  app.post<{ Body: CreateDocumentInput }>(
    '/documents',
    {
      schema: {
        body: createDocumentRequestSchema,
        response: { 201: documentResponseSchema },
      },
    },
    async (request, reply) => {
      const document = await options
        .resolveDocumentService()
        .createDocument(request.body);

      return reply
        .status(201)
        .header('Location', `/api/v1/documents/${document.id}`)
        .send({ document: serializeDocument(document) });
    },
  );

  app.get<{ Params: DocumentIdentifierParams }>(
    '/documents/:id',
    {
      schema: {
        params: documentIdentifierParamsSchema,
        response: { 200: documentResponseSchema },
      },
    },
    async (request) => {
      const document = await options
        .resolveDocumentService()
        .getDocument(request.params.id);
      return { document: serializeDocument(document) };
    },
  );

  app.put<{
    Params: DocumentIdentifierParams;
    Body: UpdateDocumentMetadataInput;
  }>(
    '/documents/:id',
    {
      schema: {
        params: documentIdentifierParamsSchema,
        body: updateDocumentMetadataRequestSchema,
        response: { 200: documentResponseSchema },
      },
    },
    async (request, reply) => {
      const document = await options
        .resolveDocumentService()
        .updateDocumentMetadata(request.params.id, request.body);
      return reply.status(200).send({ document: serializeDocument(document) });
    },
  );

  app.get<{ Params: DocumentIdentifierParams }>(
    '/documents/:id/versions',
    {
      schema: {
        params: documentIdentifierParamsSchema,
        response: { 200: documentVersionListResponseSchema },
      },
    },
    async (request) => {
      const versions = await options
        .resolveDocumentService()
        .getDocumentVersions(request.params.id);
      return { versions: versions.map(serializeDocumentVersion) };
    },
  );

  app.post<{
    Params: DocumentIdentifierParams;
    Body: CreateDocumentVersionInput;
  }>(
    '/documents/:id/versions',
    {
      schema: {
        params: documentIdentifierParamsSchema,
        body: createDocumentVersionRequestSchema,
        response: { 201: documentResponseSchema },
      },
    },
    async (request, reply) => {
      const document = await options
        .resolveDocumentService()
        .createDocumentVersion(request.params.id, request.body);

      return reply.status(201).send({ document: serializeDocument(document) });
    },
  );
};
