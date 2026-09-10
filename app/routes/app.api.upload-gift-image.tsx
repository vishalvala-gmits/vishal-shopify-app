import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const POLL_ATTEMPTS = 5;
const POLL_DELAY_MS = 600;

type StagedTarget = {
  url: string;
  resourceUrl: string;
  parameters: Array<{ name: string; value: string }>;
};

function jsonError(message: string, status = 400) {
  return Response.json({ success: false, message }, { status });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  try {
    return await handleUpload(request, admin);
  } catch (error) {
    if (error instanceof Response) {
      // Let Shopify auth/redirect responses propagate normally instead of
      // being swallowed into a JSON error the client can't handle.
      throw error;
    }
    console.error("Gift image upload failed:", error);
    return jsonError(
      error instanceof Error ? error.message : "Upload failed. Please try again.",
      500,
    );
  }
};

async function handleUpload(
  request: Request,
  admin: Awaited<ReturnType<typeof authenticate.admin>>["admin"],
) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return jsonError("No file was provided.");
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return jsonError("Only JPEG, PNG, GIF, or WEBP images are allowed.");
  }
  if (file.size > MAX_FILE_SIZE) {
    return jsonError("Image must be 5MB or smaller.");
  }

  const stagedResponse = await admin.graphql(
    `#graphql
      mutation StageGiftImageUpload($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets {
            url
            resourceUrl
            parameters {
              name
              value
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      variables: {
        input: [
          {
            filename: file.name || "gift-image",
            mimeType: file.type,
            resource: "IMAGE",
            httpMethod: "POST",
          },
        ],
      },
    },
  );
  const stagedJson = await stagedResponse.json();
  const stagedErrors = stagedJson.data?.stagedUploadsCreate?.userErrors ?? [];
  if (stagedErrors.length > 0) {
    return jsonError(stagedErrors[0].message);
  }

  const target: StagedTarget | undefined = stagedJson.data?.stagedUploadsCreate?.stagedTargets?.[0];
  if (!target) {
    return jsonError("Could not prepare the upload. Please try again.");
  }

  const uploadForm = new FormData();
  for (const param of target.parameters) {
    uploadForm.append(param.name, param.value);
  }
  uploadForm.append("file", file);

  const uploadResponse = await fetch(target.url, {
    method: "POST",
    body: uploadForm,
  });
  if (!uploadResponse.ok) {
    return jsonError("Image upload to storage failed. Please try again.");
  }

  const fileCreateResponse = await admin.graphql(
    `#graphql
      mutation CreateGiftImageFile($files: [FileCreateInput!]!) {
        fileCreate(files: $files) {
          files {
            id
            fileStatus
            ... on MediaImage {
              image {
                url
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      variables: {
        files: [
          {
            alt: "Savings scheme gift image",
            contentType: "IMAGE",
            originalSource: target.resourceUrl,
          },
        ],
      },
    },
  );
  const fileCreateJson = await fileCreateResponse.json();
  const fileErrors = fileCreateJson.data?.fileCreate?.userErrors ?? [];
  if (fileErrors.length > 0) {
    return jsonError(fileErrors[0].message);
  }

  const createdFile = fileCreateJson.data?.fileCreate?.files?.[0];
  if (!createdFile?.id) {
    return jsonError("Failed to create the file. Please try again.");
  }

  let imageUrl: string | undefined = createdFile.image?.url;
  let fileId = createdFile.id;

  for (let attempt = 0; !imageUrl && attempt < POLL_ATTEMPTS; attempt++) {
    await sleep(POLL_DELAY_MS);
    const pollResponse = await admin.graphql(
      `#graphql
        query PollGiftImageFile($id: ID!) {
          node(id: $id) {
            ... on MediaImage {
              fileStatus
              image {
                url
              }
            }
          }
        }
      `,
      { variables: { id: fileId } },
    );
    const pollJson = await pollResponse.json();
    const node = pollJson.data?.node;
    if (node?.fileStatus === "FAILED") {
      return jsonError("Image processing failed. Please try a different image.");
    }
    imageUrl = node?.image?.url;
  }

  if (!imageUrl) {
    return jsonError("Image is still processing. Please try again in a moment.");
  }

  return Response.json({ success: true, url: imageUrl });
}
