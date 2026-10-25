import { TILE_SIZE } from '@tland/shared';
import { HOUSE_DATA, type BuildingPlot } from './buildingLayout.js';

/** User-supplied introductions, displayed verbatim. */
export const HOUSE_INTRODUCTIONS: Readonly<Record<string, string>> = {
  'Wilson House': '1980年代，Sophie Wilson 參與設計一套新的處理器指令集，並透過軟體模擬測試它如何運作。這套設計成為早期 ARM 處理器的重要基礎。她也參與設計 BBC Micro，讓更多人有機會接觸電腦。後來，ARM 架構走進無數手機與電子設備。今天大家隨手滑動螢幕，背後其實藏著她當年思考的問題：如何用簡潔的指令，讓小小晶片完成更多工作。',
  'Engelbart House': '1968年，多數人還把電腦當成大型計算機，Douglas Engelbart 卻在台上用滑鼠操作文字、點選連結，甚至展示與遠方同事協作的可能。這場展示後來被稱為「所有示範之母」。觀眾看到的不只是滑鼠，而是一種全新的電腦使用方式：人們可以透過螢幕共同閱讀、編輯與分享資訊。當時看似科幻的場景，後來成為我們每天工作的日常。',
  'Moore House': '1965年，Gordon Moore 觀察到積體電路上的元件數量快速增加，預測這股趨勢還會持續。當時他估計元件數量大約每年翻倍；到了1975年，他將預測調整為約每兩年翻倍，形成後來廣為人知的摩爾定律。這原本是一項產業觀察，卻逐漸成為科技界追趕的節拍：下一代晶片，還能在更小的空間裡裝進多少運算能力？',
  'Berners-Lee House': '1989年，Tim Berners-Lee 在 CERN 提出一套資訊管理構想，希望研究人員能更容易分享與連結彼此的資料。他的主管 Mike Sendall 在提案上留下「模糊，但令人興奮」的評語。這份看似不起眼的提案，後來發展成全球資訊網（World Wide Web）。今天每次從一個連結跳到另一個頁面，都延續著當年的點子。網際網路提供了連線的基礎，而全球資訊網則讓人們能透過網頁與超連結探索資訊。',
  'Hopper House': '1947年，工程師在 Harvard Mark II 電腦的繼電器裡找到一隻飛蛾，並將牠貼進機器的工作日誌，留下著名的電腦 bug 故事。Grace Hopper 與團隊讓這段趣聞廣為流傳，但她真正重要的貢獻遠不只如此。她積極推動編譯器的發展，並促進更接近人類語言的程式設計方式。她不只讓大家記住那隻蟲，也幫助程式設計逐漸擺脫對繁瑣機器指令的依賴。',
  'Dijkstra House': '據 Edsger Dijkstra 後來的回憶，有一次他與未婚妻在阿姆斯特丹逛街，兩人坐下喝咖啡時，他開始思考如何找出城市之間的最短路徑。大約二十分鐘後，演算法的構想便逐漸成形。這段咖啡時間，後來成為資訊科學中著名的故事，也留下學生熟悉的課題：當有許多條路可以選擇時，如何一步步找出確定的最短路徑？',
  'Huffman House': '學生時代，David Huffman 在資訊理論課程中面臨一個選擇：參加期末考，或完成一項研究作業。他選擇研究，最後找到一種有效的編碼方法：讓常見符號使用較短的位元碼，較少見的符號使用較長的位元碼。這種方法後來成為資料壓縮的重要基礎，廣泛影響檔案儲存與資訊傳輸。原本為了一門課努力的成果，竟成為資訊科學的經典。這大概是最讓後世學生羨慕的一次課程作業。',
  'von Neumann House': '早期電腦若要改做另一項工作，往往得重新接線或調整硬體。John von Neumann 參與推動的儲存程式架構，讓指令也能存放在記憶體中，使電腦可以透過更換程式執行不同任務。由他執筆、彙整團隊討論的 EDVAC 設計報告流傳後，這套架構的概念也供其他研究團隊參考。電腦因此逐漸成為能不斷更換用途的工坊，而不再只是執行固定工作的機器。',
  'Turing House': '1936年，Alan Turing 想像出一種由紙帶、讀寫頭與一套簡單規則組成的抽象機器。它看起來十分簡陋，卻能用來研究一個深刻的問題：什麼事情可以被計算？更重要的是，他提出的通用圖靈機，只要改變輸入的指令與資料，就能模擬其他圖靈機。現代電腦尚未普及，他已先在紙上描繪出通用計算的核心思想。',
  'Hawkins House': '設計 PalmPilot 時，Jeff Hawkins 曾把一塊木頭當成掌上電腦，放進口袋，再拿出來假裝查行程、按按鈕。他想先弄清楚，什麼樣的裝置才值得人們每天帶著走。這塊不會發光、不能運算的木頭，反而幫助他測試裝置的尺寸、操作方式與攜帶便利性。它提醒設計者：好的隨身電腦，不只是功能強大，更必須先適合人的生活。',
  'Cooper House': '1973年，Martin Cooper 站在紐約街頭，拿起沉重的手持行動電話原型，打給競爭對手 Bell Labs 的研究主管 Joel Engel，告訴對方自己正透過手持行動電話通話。那時的手機遠遠塞不進口袋，電池與通話時間也受到限制，但這次著名的通話示範，讓人們看見行動電話不必安裝在車上，也能拿在手中隨人移動。',
  'Shockley House': '在貝爾實驗室，William Shockley 與研究團隊致力於尋找真空管的替代品。1947年，John Bardeen 與 Walter Brattain 製作出第一個成功的點接觸電晶體；隨後，Shockley 又提出接面電晶體的構想，推動電晶體技術進一步發展。三人因對半導體研究與電晶體發展的貢獻，共同獲得1956年諾貝爾物理學獎。這項突破讓電子設備有機會變得更小、更可靠，也為日後晶片容納大量電子開關鋪路。',
};

/** The one walkable row immediately south of each fixed, south-facing facade. */
export function houseNoticeAt(worldX: number, worldY: number): BuildingPlot | null {
  const x = Math.floor(worldX / TILE_SIZE);
  const y = Math.floor(worldY / TILE_SIZE);
  return HOUSE_DATA.houses.find(house =>
    y === house.y + 4 && x >= house.x && x < house.x + 4) ?? null;
}
