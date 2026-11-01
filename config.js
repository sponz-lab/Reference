/* 본사 설정 파일 — 한 번만 채우면 전국 매장이 같은 주소를 씁니다.
 *
 * 매장에서는 이 파일을 건드리지 않습니다.
 * 매장 구분은 회사 시스템에 로그인한 매장을 따라갑니다.
 *   - PC: 「리스트 가져오기」로 넘어오면 매장이 자동으로 채워집니다
 *   - 휴대폰: PC 화면의 참여 QR을 카메라로 비추면 매장이 따라옵니다
 * 어느 쪽도 아닌 경우에만 매장코드를 직접 한 번 입력합니다.
 *
 * firebase — 실시간 수량 합산용. 설정안내.md 순서대로 하면 값이 나옵니다.
 *            비워 두면 합산 없이 각자 검수하는 모드로 돌아갑니다.
 *
 * ※ 고칠 때는 아래 따옴표 사이의 값만 바꾸세요.
 *   Firebase 화면에 함께 나오는 import 줄과
 *   const app = initializeApp(...) 줄은 넣지 마세요.
 *   이 파일은 일반 스크립트라서 import 가 들어가면 전체가 멈춥니다.
 */
window.INBOUND_CONFIG = {

  firebase: {
    apiKey:            "AIzaSyC1NgX-l9IjfnxtXamiYo7Qsy-aM0rz-cQ",
    authDomain:        "fjallraven-check.firebaseapp.com",
    projectId:         "fjallraven-check",
    storageBucket:     "fjallraven-check.firebasestorage.app",
    messagingSenderId: "317994438793",
    appId:             "1:317994438793:web:77d32f1cf1365bc7b07658"
  }
};
