// Writes an audit row using the caller's client so it commits or rolls back with the change.
async function audit(client, user, action, entityType, entityId, oldValue, newValue, reason) {
  await client.query(
    `INSERT INTO audit_logs (actor_id, actor_name, action, entity_type, entity_id, old_value, new_value, reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      user ? user.id : null,
      user ? `${user.full_name} (${user.login_id})` : 'system',
      action, entityType, entityId === undefined || entityId === null ? null : String(entityId),
      oldValue === undefined ? null : JSON.stringify(oldValue),
      newValue === undefined ? null : JSON.stringify(newValue),
      reason || null,
    ]
  );
}
module.exports = { audit };
