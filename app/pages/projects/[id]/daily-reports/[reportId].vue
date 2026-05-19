<script setup lang="ts">
import Button from "primevue/button";
import Card from "primevue/card";
import Tag from "primevue/tag";
import Message from "primevue/message";
import ProgressSpinner from "primevue/progressspinner";
import DataTable from "primevue/datatable";
import Column from "primevue/column";
import Select from "primevue/select";
import InputNumber from "primevue/inputnumber";
import Image from "primevue/image";

const route = useRoute();
const projectId = computed(() => route.params.id);
const reportId = computed(() => route.params.reportId);

const {
    data: payload,
    status,
    error,
    refresh,
} = await useFetch(`/api/app/projects/${projectId.value}/daily-reports/${reportId.value}`);

const report = computed(() => payload.value?.report ?? null);
const usedMaterials = computed(() => payload.value?.materials ?? []);
const project = computed(() => report.value?.project ?? null);

const { data: materialsList } = await useFetch("/api/app/materials");

function formatQuantity(value: string | number | null | undefined) {
    if (value == null) return "—";
    const n = typeof value === "string" ? Number(value) : value;
    if (!Number.isFinite(n)) return String(value);
    return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

const reportDateParts = computed(() => {
    if (!report.value?.report_date) return null;
    const d = new Date(report.value.report_date);
    return {
        month: d.toLocaleString("default", { month: "short" }),
        day: d.getDate(),
        year: d.getFullYear(),
        weekday: d.toLocaleString("default", { weekday: "long" }),
    };
});

// --- Add material form ---
const selectedMaterialId = ref<number | null>(null);
const newQuantity = ref<number | null>(null);
const submitting = ref(false);
const submitError = ref<string | null>(null);

const selectedMaterial = computed(() => materialsList.value?.find((m) => m.id === selectedMaterialId.value) ?? null);

async function addMaterial() {
    if (!selectedMaterialId.value || !newQuantity.value || newQuantity.value <= 0) return;
    submitting.value = true;
    submitError.value = null;
    try {
        await $fetch(`/api/app/projects/${projectId.value}/daily-reports/${reportId.value}/materials`, {
            method: "POST",
            body: {
                material_id: selectedMaterialId.value,
                quantity: newQuantity.value,
            },
        });
        selectedMaterialId.value = null;
        newQuantity.value = null;
        await refresh();
    } catch (e: unknown) {
        submitError.value = e instanceof Error ? e.message : "Failed to add material";
    } finally {
        submitting.value = false;
    }
}

async function removeMaterial(usageId: number) {
    try {
        await $fetch(`/api/app/projects/${projectId.value}/daily-reports/${reportId.value}/materials/${usageId}`, {
            method: "DELETE",
        });
        await refresh();
    } catch (e: unknown) {
        submitError.value = e instanceof Error ? e.message : "Failed to remove material";
    }
}
</script>

<template>
    <div class="space-y-6">
        <!-- Breadcrumb -->
        <nav class="flex items-center gap-1.5 text-xs tracking-wide text-surface-400 uppercase">
            <NuxtLink to="/projects" class="transition-colors hover:text-primary-500">Projects</NuxtLink>
            <i class="pi pi-angle-right text-[10px]" />
            <NuxtLink v-if="project" :to="`/projects/${projectId}`" class="transition-colors hover:text-primary-500">
                {{ project.name }}
            </NuxtLink>
            <i class="pi pi-angle-right text-[10px]" />
            <span class="text-surface-600 dark:text-surface-400">Daily Report</span>
        </nav>

        <!-- Page header -->
        <div class="flex items-center gap-4">
            <NuxtLink :to="`/projects/${projectId}`">
                <Button icon="pi pi-arrow-left" severity="secondary" text rounded aria-label="Back to project" />
            </NuxtLink>

            <!-- Calendar date badge -->
            <div
                v-if="reportDateParts"
                class="w-20 shrink-0 overflow-hidden rounded-xl border border-surface-200 shadow-sm dark:border-surface-700"
            >
                <div
                    class="bg-primary-500 py-1 text-center text-[9px] font-bold tracking-[0.15em] text-white uppercase"
                >
                    {{ reportDateParts.month }}
                </div>
                <div class="flex flex-col items-center bg-surface-0 py-1.5 dark:bg-surface-900">
                    <span class="text-3xl leading-none font-bold text-surface-800 dark:text-surface-100">
                        {{ reportDateParts.day }}
                    </span>
                    <span class="mt-0.5 text-[10px] text-surface-400">{{ reportDateParts.year }}</span>
                </div>
            </div>

            <div>
                <h1 class="text-2xl font-semibold text-surface-900 dark:text-surface-0">Daily Report</h1>
                <p v-if="reportDateParts" class="mt-0.5 text-sm text-surface-500">
                    {{ reportDateParts.weekday }}
                </p>
            </div>
        </div>

        <div v-if="status === 'pending'" class="flex items-center gap-2">
            <ProgressSpinner style="width: 20px; height: 20px" stroke-width="4" />
            <span class="text-sm text-surface-500">Loading…</span>
        </div>

        <Message v-else-if="error" severity="error" :closable="false">
            <strong>Failed to load report:</strong> {{ error.message }}
        </Message>

        <template v-else-if="report">
            <Card>
                <template #title>
                    <div class="flex items-center gap-2">
                        <i class="pi pi-align-left text-primary-500" />
                        <span>Summary</span>
                    </div>
                </template>
                <template #content>
                    <p class="leading-relaxed whitespace-pre-wrap text-surface-700 dark:text-surface-300">
                        {{ report.attributes.summary }}
                    </p>
                </template>
            </Card>

            <Card v-if="report.photo_path">
                <template #title>
                    <div class="flex items-center gap-2">
                        <i class="pi pi-image text-primary-500" />
                        <span>Photo</span>
                    </div>
                </template>
                <template #content>
                    <Image :src="report.photo_path" alt="Report photo" preview class="max-w-full">
                        <template #image>
                            <img
                                :src="report.photo_path"
                                alt="Report photo"
                                class="max-h-96 w-full rounded-lg object-contain"
                            />
                        </template>
                    </Image>
                </template>
            </Card>

            <Card>
                <template #title>
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <i class="pi pi-box text-primary-500" />
                            <span>Materials Used</span>
                        </div>
                        <Tag
                            v-if="usedMaterials.length"
                            :value="`${usedMaterials.length} item${usedMaterials.length !== 1 ? 's' : ''}`"
                            severity="secondary"
                        />
                    </div>
                </template>
                <template #content>
                    <div class="space-y-5">
                        <DataTable
                            :value="usedMaterials"
                            striped-rows
                            size="small"
                            :row-hover="true"
                            empty-message="No materials recorded for this report yet."
                        >
                            <Column field="material.name" header="Material">
                                <template #body="{ data }">
                                    {{ data.material?.name ?? "—" }}
                                </template>
                            </Column>
                            <Column field="material.category" header="Category" style="width: 12rem">
                                <template #body="{ data }">
                                    {{ data.material?.category ?? "—" }}
                                </template>
                            </Column>
                            <Column field="quantity" header="Quantity" style="width: 8rem">
                                <template #body="{ data }">
                                    {{ formatQuantity(data.quantity) }}
                                </template>
                            </Column>
                            <Column field="material.unit" header="Unit" style="width: 7rem">
                                <template #body="{ data }">
                                    {{ data.material?.unit ?? "—" }}
                                </template>
                            </Column>
                            <Column header="" style="width: 4rem">
                                <template #body="{ data }">
                                    <Button
                                        icon="pi pi-trash"
                                        severity="danger"
                                        text
                                        rounded
                                        aria-label="Remove material"
                                        @click="removeMaterial(data.id)"
                                    />
                                </template>
                            </Column>
                        </DataTable>

                        <!-- Add material form -->
                        <div
                            class="rounded-lg border border-surface-200 bg-surface-50 p-4 dark:border-surface-700 dark:bg-surface-800/50"
                        >
                            <div class="mb-4 flex items-center gap-2">
                                <i class="pi pi-plus-circle text-sm text-primary-500" />
                                <span class="text-sm font-semibold">Add Material</span>
                            </div>

                            <div class="grid grid-cols-1 gap-3 sm:grid-cols-12 sm:items-end">
                                <div class="sm:col-span-5">
                                    <label class="mb-1 block text-xs tracking-wide text-surface-500 uppercase">
                                        Material
                                    </label>
                                    <Select
                                        v-model="selectedMaterialId"
                                        :options="materialsList ?? []"
                                        option-label="name"
                                        option-value="id"
                                        placeholder="Select material"
                                        filter
                                        fluid
                                        :disabled="submitting"
                                    />
                                </div>
                                <div class="sm:col-span-2">
                                    <label class="mb-1 block text-xs tracking-wide text-surface-500 uppercase">
                                        Quantity
                                    </label>
                                    <div class="flex items-center gap-2">
                                        <InputNumber
                                            v-model="newQuantity"
                                            :min-fraction-digits="0"
                                            :max-fraction-digits="2"
                                            :min="0"
                                            fluid
                                            :disabled="submitting"
                                        />
                                        <span class="shrink-0 text-sm text-surface-500">
                                            {{ selectedMaterial?.unit ?? "—" }}
                                        </span>
                                    </div>
                                </div>
                                <div class="sm:col-span-5">
                                    <Button
                                        label="Add"
                                        icon="pi pi-plus"
                                        fluid
                                        :loading="submitting"
                                        :disabled="!selectedMaterialId || !newQuantity || newQuantity <= 0"
                                        @click="addMaterial"
                                    />
                                </div>
                            </div>

                            <Message v-if="submitError" severity="error" :closable="false" class="mt-3">
                                {{ submitError }}
                            </Message>
                        </div>
                    </div>
                </template>
            </Card>
        </template>
    </div>
</template>
