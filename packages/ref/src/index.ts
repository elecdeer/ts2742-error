import { getVersion } from "subref";

export const getVersionSubRef = getVersion;
//            ^? () => `subref@${string}.${string}.${string}`
// 知らない名前の型は出てこないので問題無し
