module.exports = {
  apps: [{
    name: 't1-payout-orchestrator',
    script: './dist/index.js',
    cwd: '/opt/t1-payout-orchestrator',
    env_file: '/opt/t1-payout-orchestrator/.env',
    restart_delay: 5000,
    max_restarts: 10
  }]
};
