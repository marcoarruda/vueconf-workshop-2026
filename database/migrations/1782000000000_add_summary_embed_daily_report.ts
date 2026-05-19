import { sql, type Kysely } from 'kysely'
import { useAppConfig, useRuntimeConfig } from 'nuxt/app';
import { GoogleGenAI } from '@google/genai';

const EMBEDDING_MODEL = process.env.NUXT_GEMINI_EMBEDDING_MODEL as string
const GEMINI_API_KEY = process.env.NUXT_GEMINI_API_KEY

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

async function embedSummary(summary: string): Promise<number[]> {
	const response = await ai.models.embedContent({
		model: EMBEDDING_MODEL,
		contents: summary,
		config: {
			outputDimensionality: 768,
		}
	})
	return response.embeddings![0].values!
}

export async function up(db: Kysely<any>): Promise<void> {
	await db.schema.alterTable('project_daily_reports')
		.addColumn('summary_embedding', sql`vector(768)`)
		.execute();

	// backfill summary_embedding for existing records
	const reports = await db.selectFrom('project_daily_reports')
		.select(['id', 'summary'])
		.where('summary_embedding', 'is', null)
		.execute();

	for (const report of reports) {
		const embedding = await embedSummary(report.summary)
		await db.updateTable('project_daily_reports')
			.set({ summary_embedding: sql`${JSON.stringify(embedding)}::vector(768)` })
			.where('id', '=', report.id)
			.execute();
	}

	await db.schema.alterTable('project_daily_reports')
		.alterColumn('summary_embedding', (col) => col.setNotNull())
		.execute();
}

export async function down(db: Kysely<any>): Promise<void> {
	await db.schema.alterTable('project_daily_reports')
		.dropColumn('summary_embedding')
		.execute();
}
