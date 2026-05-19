import { sql, type RawBuilder } from "kysely";
import ai from "./ai";

export const embedText = async (summary: string): Promise<number[]> => {
    const config = useRuntimeConfig();
    const outputDimensionality = config.geminiEmbeddingDimensionality;

    const response = await ai.models.embedContent({
        model: config.geminiEmbeddingModel,
        contents: summary,
        config: { outputDimensionality }
    })

    if (!response.embeddings) throw new Error("Embedding generation failed: No embeddings returned");
    if (response.embeddings.length === 0) throw new Error("Embedding generation failed: Empty embeddings array");
    if (!response.embeddings[0]!.values) throw new Error("Embedding generation failed: No values in the first embedding");

    const values = response.embeddings[0]!.values;
    const literal = `'${JSON.stringify(values)}'::vector(${outputDimensionality})`

    return sql.raw(literal) as unknown as number[]
}