function truncateText(value, maxLength = 1000) {
  if (!value) {
    return "(なし)";
  }

  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

function formatUser(user) {
  if (!user) {
    return "Unknown";
  }

  if (!user.tag && !user.username && user.id) {
    return `Unknown (${user.id})`;
  }

  return `${user.tag ?? user.username} (${user.id})`;
}

module.exports = {
  formatUser,
  truncateText,
};
