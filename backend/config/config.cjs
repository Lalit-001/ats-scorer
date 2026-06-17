// sequelize-cli database config. All environments read the DATABASE_URL env var.
const common = {
  use_env_variable: "DATABASE_URL",
  dialect: "postgres",
};

module.exports = {
  development: common,
  test: common,
  production: common,
};
