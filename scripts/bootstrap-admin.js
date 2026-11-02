require('dotenv').config();
const readline = require('readline');
const { createClient } = require('@supabase/supabase-js');
let currentStage = 'starting';

function promptText(question) {
  return new Promise(resolve => {
    const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
    terminal.question(question, answer => {
      terminal.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  currentStage = 'checking Supabase project URL';
  const { SUPABASE_URL } = process.env;
  if (!SUPABASE_URL) throw new Error('Set SUPABASE_URL in the local environment first.');
  currentStage = 'collecting administrator details';
  const email = (await promptText('Admin email: ')).toLowerCase();
  console.warn('Warning: the next two values will be visible in terminal output and may remain in scrollback.');
  const serviceRoleKey = (await promptText('Supabase service-role key (visible): ')).trim();
  const adminPassword = await promptText('Choose a unique admin password (visible): ');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Enter a valid admin email address.');
  if (!/^[\x21-\x7e]{1,8192}$/.test(serviceRoleKey)) {
    throw new Error('The service-role key is empty or contains invalid characters. Copy only the key value, without quotes or formatting.');
  }
  if (adminPassword.length < 16) {
    throw new Error('Use a unique administrator password with at least 16 characters.');
  }

  currentStage = 'connecting to Supabase Auth admin API';
  const supabase = createClient(SUPABASE_URL, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  currentStage = 'checking for an existing Auth user';
  let userListResponse;
  try {
    userListResponse = await fetch(new URL('/auth/v1/admin/users?page=1&per_page=1000', SUPABASE_URL), {
      headers: {
        apikey: serviceRoleKey,
        Authorization: 'Bearer ' + serviceRoleKey
      }
    });
  } catch (error) {
    const cause = error.cause;
    const detail = [cause && cause.code, cause && cause.message].filter(Boolean).join(': ');
    throw new Error('Could not connect to Supabase Auth' + (detail ? ' (' + detail + ')' : '. Check the project URL, TLS, firewall, or proxy settings.'));
  }
  if (!userListResponse.ok) {
    if ([401, 403].includes(userListResponse.status)) {
      throw new Error('Supabase rejected the key (HTTP ' + userListResponse.status + '). Use this project’s service_role secret, not its public/anon key.');
    }
    throw new Error('Supabase Auth returned HTTP ' + userListResponse.status + ' while listing users.');
  }
  const userPage = await userListResponse.json();

  const existingUser = (userPage.users || []).find(user => user.email?.toLowerCase() === email);
  let user;
  if (existingUser) {
    currentStage = 'updating the existing Auth user';
    const { data, error } = await supabase.auth.admin.updateUserById(existingUser.id, {
      email_confirm: true,
      password: adminPassword,
      user_metadata: { ...existingUser.user_metadata, display_name: 'AdminK' }
    });
    if (error) throw error;
    user = data.user;
  } else {
    currentStage = 'creating the Auth user';
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: adminPassword,
      email_confirm: true,
      user_metadata: { display_name: 'AdminK' }
    });
    if (error) throw error;
    user = data.user;
  }

  currentStage = 'granting the signed administrator claim';
  const { data: updatedUser, error: metadataError } = await supabase.auth.admin.updateUserById(user.id, {
    app_metadata: { ...user.app_metadata, marketplace_role: 'admin' }
  });
  if (metadataError) throw metadataError;
  user = updatedUser.user;

  currentStage = 'saving the approved administrator profile';
  const { error: profileError } = await supabase.from('profiles').upsert({
    id: user.id,
    display_name: 'AdminK',
    email,
    role: 'admin',
    approval_status: 'approved',
    approved_at: new Date().toISOString(),
    approved_by: user.id
  }, { onConflict: 'id' });
  if (profileError) throw profileError;

  console.log('AdminK account is ready for ' + email + '.');
}

main().catch(error => {
  const cause = error.cause;
  const details = [cause && cause.code, cause && cause.message].filter(Boolean).join(': ');
  console.error(
    'Admin bootstrap failed while ' + currentStage + ': ' +
    (error.message || 'unknown error') + (details ? ' (' + details + ')' : '')
  );
  process.exitCode = 1;
});
