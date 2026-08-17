const { Readable } = require("node:stream");

const FOLDER_MIME = "application/vnd.google-apps.folder";
const PDF_MIME = "application/pdf";
const ROOT_FOLDER_NAME = "MathMaster Classroom Resources";
const ROOT_FOLDER_KEY = "mathmaster-classroom-resources-root";

function cleanFolderName(value, fallback = "Lesson Resources") {
  const cleaned = String(value || "")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return cleaned || fallback;
}

function escapeDriveQueryValue(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'");
}

async function findFolderByKey(drive, key, parentId = null) {
  const conditions = [
    `mimeType='${FOLDER_MIME}'`,
    "trashed=false",
    `appProperties has { key='mathMasterFolderKey' and value='${escapeDriveQueryValue(key)}' }`,
  ];
  if (parentId) conditions.push(`'${escapeDriveQueryValue(parentId)}' in parents`);
  const response = await drive.files.list({
    q: conditions.join(" and "),
    spaces: "drive",
    pageSize: 10,
    fields: "files(id,name,parents,webViewLink)",
  });
  return (response.data.files || [])[0] || null;
}

async function ensureFolder(drive, { name, key, parentId = null }) {
  const existing = await findFolderByKey(drive, key, parentId);
  if (existing) return existing;
  const response = await drive.files.create({
    requestBody: {
      name: cleanFolderName(name),
      mimeType: FOLDER_MIME,
      parents: parentId ? [parentId] : undefined,
      appProperties: {
        mathMasterFolderKey: key,
        mathMasterManaged: "true",
      },
    },
    fields: "id,name,parents,webViewLink",
  });
  return response.data;
}

async function ensureResourceFolder(drive, topicName) {
  const root = await ensureFolder(drive, {
    name: ROOT_FOLDER_NAME,
    key: ROOT_FOLDER_KEY,
  });
  const cleanTopic = cleanFolderName(topicName || "General Resources");
  const topicKey = `mathmaster-topic:${cleanTopic.toLowerCase()}`;
  const topic = await ensureFolder(drive, {
    name: cleanTopic,
    key: topicKey,
    parentId: root.id,
  });
  return { root, topic };
}

async function findManagedPdf(drive, resourceKey) {
  const response = await drive.files.list({
    q: [
      `mimeType='${PDF_MIME}'`,
      "trashed=false",
      `appProperties has { key='mathMasterResourceKey' and value='${escapeDriveQueryValue(resourceKey)}' }`,
    ].join(" and "),
    spaces: "drive",
    pageSize: 10,
    fields: "files(id,name,mimeType,parents,webViewLink,webContentLink,modifiedTime)",
  });
  return (response.data.files || [])[0] || null;
}

async function upsertLessonNotesPdf({
  drive,
  bytes,
  assignmentId,
  fileName,
  title,
  topicName,
}) {
  if (!drive) throw new Error("A Google Drive client is required.");
  if (!Buffer.isBuffer(bytes) || !bytes.length) throw new Error("PDF bytes are required.");
  const cleanAssignmentId = String(assignmentId || "").trim();
  if (!cleanAssignmentId) throw new Error("assignmentId is required.");

  const { root, topic } = await ensureResourceFolder(drive, topicName);
  const resourceKey = `assignment:${cleanAssignmentId}:notes`;
  const existing = await findManagedPdf(drive, resourceKey);

  const requestBody = {
    name: String(fileName || "MathMaster_Student_Notes.pdf").slice(0, 180),
    description: String(title || "MathMaster Student Notes").slice(0, 1000),
    appProperties: {
      mathMasterManaged: "true",
      mathMasterAssignmentId: cleanAssignmentId,
      mathMasterResourceKey: resourceKey,
    },
  };
  const media = {
    mimeType: PDF_MIME,
    body: Readable.from([bytes]),
  };

  let file;
  if (existing?.id) {
    const response = await drive.files.update({
      fileId: existing.id,
      requestBody,
      media,
      fields: "id,name,mimeType,parents,webViewLink,webContentLink,modifiedTime",
    });
    file = response.data;
  } else {
    const response = await drive.files.create({
      requestBody: {
        ...requestBody,
        mimeType: PDF_MIME,
        parents: [topic.id],
      },
      media,
      fields: "id,name,mimeType,parents,webViewLink,webContentLink,modifiedTime",
    });
    file = response.data;
  }

  return {
    provider: "googleDrive",
    driveFileId: file.id,
    fileName: file.name || requestBody.name,
    title: String(title || "Student Notes").trim(),
    mimeType: file.mimeType || PDF_MIME,
    alternateLink: file.webViewLink || null,
    webViewLink: file.webViewLink || null,
    webContentLink: file.webContentLink || null,
    folderId: topic.id,
    folderName: topic.name,
    rootFolderId: root.id,
    rootFolderName: root.name,
    resourceKey,
    updatedAt: new Date().toISOString(),
  };
}

module.exports = {
  ROOT_FOLDER_NAME,
  cleanFolderName,
  ensureResourceFolder,
  upsertLessonNotesPdf,
};
