declare const prismDesktop: {
  getVersion: () => Promise<string>;
  log: (msg: string) => void;
};

void prismDesktop.getVersion();
