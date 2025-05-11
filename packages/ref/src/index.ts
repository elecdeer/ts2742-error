import { getVersion } from "subref";

export const getVersionSubRef = getVersion;
//            ^? GetVersion
// 型推論によって"GetVersion"という名前の型が得られるが、
// この型は（subref/src/index.tsからの相対）./types.d.tsを参照しないと、型宣言として出力できない！
// が、refのtsc視点だと、./types.d.tsをどこに持って行っても問題無い（ = 移植性のある）パスとして書くことはできない
