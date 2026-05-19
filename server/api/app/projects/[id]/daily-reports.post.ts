import { z } from "zod";

const fieldsSchema = z.object({
    report_date: z
        .string()
        .trim()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "report_date must be YYYY-MM-DD")
        .optional(),
    summary: z.string().trim().min(1, "Summary is required"),
});

const paramsSchema = z.object({ id: z.coerce.number().int().positive() });

const allowedImageTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];

const createRelatedTagsUsage = async (report: ProjectDailyReport) => {
    const existingTags: DailyReportTag[] = await DailyReportTag.all()

    const prompt = `
Extract the relevant tags for a daily report based on the following summary:
${report.summary}

The available tags are:
${existingTags.map((t) => `- [# ${t.id}] ${t.name}`).join("\n")}

Return an array of tag ids that are relevant to the daily report summary. Only include tags that are explicitly relevant.
`;

    console.log(prompt);

    const zodValidatorTagIds = z.array(z.number().int().positive());

    const jsonSchema = z.toJSONSchema(zodValidatorTagIds);

    const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
            responseJsonSchema: { text: { mimeType: "application/json", schema: jsonSchema } },
        },
    });

    console.log(response.text);

    const projectDailyReportTagIds = JSON.parse(response.text ?? '')

    console.log(projectDailyReportTagIds.map((id: number) => {
        return { id, name: existingTags.find((t) => t.id === id)?.name }
    }));

    type DailyReportTagUsageInput = { daily_report_id: number; daily_report_tag_id: number }[]
    const dailyReportTagUsageList: DailyReportTagUsageInput  = projectDailyReportTagIds.map((tagId: number) => ({
        daily_report_id: report.id,
        daily_report_tag_id: tagId,
    }));
    console.log(dailyReportTagUsageList)

    await Promise.all(dailyReportTagUsageList.map(async (tagUsage) => {
        await DailyReportTagUsage.create(tagUsage);
    }))

};

export default defineEventHandler(async (event) => {
    const { id } = await getValidatedRouterParams(event, paramsSchema.parse);

    const project = await Project.find(id);
    if (!project) {
        throw createError({ statusCode: 404, statusMessage: "Project not found" });
    }

    const parts = await readMultipartFormData(event);

    const { report_date, summary } = fieldsSchema.parse({
        report_date: parts?.find((p) => p.name === "report_date")?.data?.toString(),
        summary: parts?.find((p) => p.name === "summary")?.data?.toString(),
    });

    const reportDate = report_date || new Date().toISOString().slice(0, 10);

    const photoPart = parts?.find((p) => p.name === "photo");

    if (photoPart?.data && photoPart.data.length > 0 && !allowedImageTypes.includes(photoPart.type ?? "")) {
        throw createError({ statusCode: 400, statusMessage: "Photo must be an image file (jpeg, png, gif, webp)" });
    }

    const report = await ProjectDailyReport.create({
        project_id: id,
        report_date: reportDate,
        summary,
        photo_file_name: null,
    });

    // add related tags to the daily report
    await createRelatedTagsUsage(report);

    if (photoPart?.data && photoPart.data.length > 0) {
        await report.savePhoto(photoPart.data, photoPart.filename ?? "photo.jpg");
    }

    return report;
});
