export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [1, 'always', ['api', 'web', 'shared', 'infra', 'docs', 'ci', 'deps', 'repo']],
  },
};
