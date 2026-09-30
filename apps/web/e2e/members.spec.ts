import { expect, test } from '@playwright/test';
import { carolMember, pendingInvite, readInvites, readMembers, seedMembers, seedRuleSets, umaMember } from './fixtures';

// The admin section (Members): an admin sees who is in the workspace, invites
// by email, changes roles and removes people; a standard user has none of it.
// In memory mode the members service is a double with the same guards as the
// Function: one admin must remain, nobody removes themselves, no duplicates.

test('an admin sees members and invites, and the nav shows the admin section', async ({ page }) => {
  await seedRuleSets(page);
  await seedMembers(page, [umaMember, carolMember], [pendingInvite]);
  await page.goto('/author');
  await page.getByTestId('link-nav-members').click();
  await expect(page).toHaveURL(/\/members$/);

  await expect(page.getByTestId('text-member-count')).toHaveText('3 members');
  await expect(page.getByTestId('row-member-you')).toContainText('You');
  await expect(page.getByTestId('row-member-uma')).toContainText('uma@acme.test');
  await expect(page.getByTestId('select-member-role-uma')).toHaveValue('user');
  await expect(page.getByTestId('select-member-role-carol')).toHaveValue('admin');
  await expect(page.getByTestId('button-remove-member-you')).toBeDisabled();

  await expect(page.getByTestId('text-invite-count')).toHaveText('1 pending');
  await expect(page.getByTestId('row-invite-inv-new')).toContainText('new@acme.test');
  await expect(page.getByTestId('text-invite-status-inv-new')).toHaveText('pending');

  // The action survives a reload as the last one used.
  await page.reload();
  await expect(page).toHaveURL(/\/members$/);
  await expect(page.getByTestId('text-member-count')).toHaveText('3 members');
});

test('inviting by email adds a pending invite; duplicates and bad addresses are refused', async ({ page }) => {
  await seedRuleSets(page);
  await seedMembers(page, [umaMember], [pendingInvite]);
  await page.goto('/members');

  await page.getByTestId('input-invite-email').fill('Dana@Acme.test');
  await page.getByTestId('select-invite-role').selectOption('admin');
  await page.getByTestId('button-send-invite').click();
  await expect(page.getByTestId('text-members-notice')).toContainText('dana@acme.test is invited as admin');
  await expect(page.getByTestId('input-invite-email')).toHaveValue('');
  await expect(page.getByTestId('text-invite-count')).toHaveText('2 pending');
  const invites = await readInvites(page);
  expect(invites.find((invite) => invite.email === 'dana@acme.test')).toMatchObject({ role: 'admin', status: 'pending' });

  await page.getByTestId('input-invite-email').fill('new@acme.test');
  await page.getByTestId('button-send-invite').click();
  await expect(page.getByTestId('text-members-error')).toContainText('already has a pending invite');

  await page.getByTestId('input-invite-email').fill('uma@acme.test');
  await page.getByTestId('button-send-invite').click();
  await expect(page.getByTestId('text-members-error')).toContainText('already a member');

  await page.getByTestId('input-invite-email').fill('not-an-email');
  await page.getByTestId('form-invite').evaluate((form: HTMLFormElement) => form.requestSubmit());
  await expect(page.getByTestId('text-invite-count')).toHaveText('2 pending');
});

test('roles change, the last admin stays, and revoking an invite records it', async ({ page }) => {
  await seedRuleSets(page);
  await seedMembers(page, [umaMember], [pendingInvite]);
  await page.goto('/members');

  // The local user is the only admin: stepping down is refused.
  await page.getByTestId('select-member-role-you').selectOption('user');
  await expect(page.getByTestId('text-members-error')).toContainText('only admin');
  await expect(page.getByTestId('select-member-role-you')).toHaveValue('admin');

  // Promote Uma, then stepping down is allowed.
  await page.getByTestId('select-member-role-uma').selectOption('admin');
  await expect(page.getByTestId('text-members-notice')).toContainText('Uma Ortiz is now an admin');
  expect((await readMembers(page)).find((member) => member.uid === 'uma')?.role).toBe('admin');
  await page.getByTestId('select-member-role-you').selectOption('user');
  await expect(page.getByTestId('text-members-notice')).toContainText('Sign out and in to pick up your new role');

  await page.getByTestId('button-revoke-invite-inv-new').click();
  await expect(page.getByTestId('text-invite-status-inv-new')).toHaveText('revoked');
  await expect(page.getByTestId('text-invite-count')).toHaveText('0 pending');
  await expect(page.getByTestId('button-revoke-invite-inv-new')).toHaveCount(0);
});

test('removing a member takes them out of the list; the caller and the last admin are protected', async ({ page }) => {
  await seedRuleSets(page);
  await seedMembers(page, [umaMember, carolMember]);
  await page.goto('/members');
  page.on('dialog', (dialog) => dialog.accept());

  await page.getByTestId('button-remove-member-uma').click();
  await expect(page.getByTestId('text-members-notice')).toContainText('Uma Ortiz no longer has access');
  await expect(page.getByTestId('row-member-uma')).toHaveCount(0);
  await expect(page.getByTestId('text-member-count')).toHaveText('2 members');

  // Carol is the other admin: removing her is allowed; then "you" is the last admin.
  await page.getByTestId('button-remove-member-carol').click();
  await expect(page.getByTestId('row-member-carol')).toHaveCount(0);
  await expect(page.getByTestId('button-remove-member-you')).toBeDisabled();
  expect((await readMembers(page)).map((member) => member.uid)).toEqual(['you']);
});

test('a standard user has no admin section and /members says so', async ({ page }) => {
  await seedRuleSets(page, undefined, 'user');
  await seedMembers(page, [umaMember], [pendingInvite]);
  await page.goto('/author');
  await expect(page.getByTestId('link-nav-members')).toHaveCount(0);

  await page.goto('/members');
  await expect(page.getByText('Only a workspace admin can see and manage members.')).toBeVisible();
  await expect(page.getByTestId('section-members')).toHaveCount(0);
});
