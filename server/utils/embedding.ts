import { sql } from "kysely";

const config = useRuntimeConfig();

export const embedText = async (summary: string): Promise<number[]> => {
    const response = await ai.models.embedContent({
        model: config.geminiEmbeddingModel,
        contents: summary,
        config: {
            outputDimensionality: config.geminiEmbeddingDimensionality,
        }
    })

    if (!response.embeddings) throw new Error("Embedding generation failed: No embeddings returned");
    if (response.embeddings.length === 0) throw new Error("Embedding generation failed: Empty embeddings array");
    if (!response.embeddings[0]!.values) throw new Error("Embedding generation failed: No values in the first embedding");

    const embeddingValues = response.embeddings[0]!.values;

    return sql`${JSON.stringify(embeddingValues)}::vector(${config.geminiEmbeddingDimensionality})` as unknown as number[];
}