// Waar de data staat. De app zelf is openbaar; de inhoud komt uit deze private repo
// en is alleen leesbaar met een token van iemand die toegang heeft.
export const CONFIG = {
  owner: 'robertvanstraten',
  repo: 'thesis',
  branch: 'dashboard', // aparte branch zodat afvinken geen commits op main zet
  mainBranch: 'main', // voor de activiteitenfeed (je eigen commits)
  files: {
    todo: 'todo.json',
    lit: 'literature.json',
    papers: 'feed/papers.json',
    feedState: 'feed/state.json',
  },
};
