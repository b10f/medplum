// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/* global console, fetch, process, URL, URLSearchParams */

// Seeds the example questionnaires in ./questionnaires into a running Medplum server, to try out Questionnaire Builder
// v2 with. Each one is created unless a questionnaire with its canonical URL already exists, which is left as it is.
//
// Usage: npm run seed:questionnaires
// Environment: MEDPLUM_BASE_URL (default http://localhost:8103/), MEDPLUM_APP_URL (default http://localhost:3000/),
// MEDPLUM_EMAIL and MEDPLUM_PASSWORD (default: the server's default super admin).

import { ClientStorage, MedplumClient, MemoryStorage } from '@medplum/core';
import { createHash, randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';

const baseUrl = process.env.MEDPLUM_BASE_URL ?? 'http://localhost:8103/';
const appUrl = process.env.MEDPLUM_APP_URL ?? 'http://localhost:3000/';
const email = process.env.MEDPLUM_EMAIL ?? 'admin@example.com';
const password = process.env.MEDPLUM_PASSWORD ?? 'medplum_admin';
const directory = new URL('./questionnaires/', import.meta.url);

const storage = new ClientStorage(new MemoryStorage());
const medplum = new MedplumClient({ baseUrl, fetch, storage });

// PKCE with Node's crypto, since MedplumClient's own uses the browser's.
const codeVerifier = randomBytes(32).toString('base64url');
storage.setString('codeVerifier', codeVerifier);
const login = await medplum.startLogin({
  email,
  password,
  codeChallenge: createHash('sha256').update(codeVerifier).digest('base64url'),
  codeChallengeMethod: 'S256',
});
if (!login.code) {
  throw new Error(`${email} belongs to several projects; sign in with a user that has one (MEDPLUM_EMAIL)`);
}
await medplum.processCode(login.code);

for (const file of readdirSync(directory)
  .filter((name) => name.endsWith('.json'))
  .sort()) {
  const questionnaire = JSON.parse(readFileSync(new URL(file, directory), 'utf8'));
  const seeded = await medplum.createResourceIfNoneExist(
    questionnaire,
    new URLSearchParams({ url: questionnaire.url }).toString()
  );
  console.log(`${questionnaire.title}: ${appUrl}Questionnaire/${seeded.id}/builder-v2`);
}
