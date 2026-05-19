import { sql } from "kysely";
import { z } from "zod";

const querySchema = z.object({
    q: z.string().optional(),
});

export default defineEventHandler(async (event) => {
    const { q } = await getValidatedQuery(event, querySchema.parse);

    if (!q) {
        return Project.all();
    }

    const pattern = `%${q}%`;

    const searchEmbedding = await embedText(q);

    return Project.where((eb) =>
        eb.or([
            eb("name", "ilike", pattern),
            eb(
                "id",
                "in",
                eb.selectFrom("project_daily_reports").where("summary", "ilike", pattern).select("project_id"),
            ),
            eb("id",
                "in",
                eb.selectFrom("project_daily_reports").where(sql`summary_embedding <=> ${searchEmbedding}`, "<", 0.5).select("project_id"),
            ),
        ]),
    ).get();
});
