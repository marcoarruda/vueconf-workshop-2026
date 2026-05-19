import { z } from "zod";
import type { MultiPartData } from 'h3';

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

    const zodValidatorTagIds = z.array(z.number().int().positive());

    const jsonSchema = z.toJSONSchema(zodValidatorTagIds);

    const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
            responseJsonSchema: { text: { mimeType: "application/json", schema: jsonSchema } },
        },
    });

    const projectDailyReportTagIds = JSON.parse(response.text ?? '')

    type DailyReportTagUsageInput = { daily_report_id: number; daily_report_tag_id: number }[]
    const dailyReportTagUsageList: DailyReportTagUsageInput = projectDailyReportTagIds.map((tagId: number) => ({
        daily_report_id: report.id,
        daily_report_tag_id: tagId,
    }));

    await Promise.all(dailyReportTagUsageList.map(async (tagUsage) => {
        await DailyReportTagUsage.create(tagUsage);
    }))
};

const validateImageType = (image: MultiPartData) => {
    if (!allowedImageTypes.includes(image.type ?? "")) {
        throw createError({ statusCode: 400, statusMessage: "Photo must be an image file (jpeg, png, gif, webp)" });
    }
}

/*
We finished the roof, despite the rain and wet environment
*/

const validateUploadedImageContent = async (image: MultiPartData, reportSummary: string) => {
    const contents = [
        {
            inlineData: {
                mimeType: image.type,
                data: image.data.toString("base64"),
            }
        },
        {
            text: `Is the content of the image appropriate according to the following summary? "${reportSummary}". Respond with true or false followed by a brief explanation, if false.`
        }
    ]

    const responseImageValidation = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents,
    })

    const responseImageValidationText = responseImageValidation.text ?? ''

    if (!responseImageValidationText.toLowerCase().includes("true") && !responseImageValidationText.toLowerCase().includes("false")) {
        throw createError({ statusCode: 400, statusMessage: "Invalid response from image validation" });
    }

    const prompt = `Format the following text "${responseImageValidationText}" to the json expected: "{ isImageAppropriate: boolean, explanation: string }".`
    const schema = z.toJSONSchema(z.object({ isImageAppropriate: z.boolean().describe('True if it is a valid image, false if not'), explanation: z.string().describe('A brief explanation if the image is not appropriate') }))
    const responseFormat = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
            responseJsonSchema: {
                text: {
                    mimeType: "application/json",
                    schema
                }
            },
        }
    })

    const { isImageAppropriate, explanation } = JSON.parse(responseFormat.text ?? '{}')

    if (!isImageAppropriate) {
        throw createError({ statusCode: 400, statusMessage: `Invalid image content: ${explanation}` });
    }
}

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

    // image validation
    const hasOneImageUploaded = photoPart?.data && photoPart.data.length > 0;
    if (hasOneImageUploaded) {
        validateImageType(photoPart);
        await validateUploadedImageContent(photoPart, summary);
    }

    // add the daily report to the database
    const report = await ProjectDailyReport.create({
        project_id: id,
        report_date: reportDate,
        summary,
        photo_file_name: null,
    });

    // add related tags to the daily report based on the summary using Gemini
    await createRelatedTagsUsage(report);

    // save the photo to the file system after the report is created and related tags are added
    if (hasOneImageUploaded) {
        await report.savePhoto(photoPart.data, photoPart.filename ?? "photo.jpg");
    }

    return report;
});
