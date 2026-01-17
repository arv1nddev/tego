import React, { useState, useEffect, useCallback } from 'react';
import { Play, Users, Cpu, RotateCcw, Home } from 'lucide-react';

// ===== DOMAIN MODELS =====
const PlayerType = {
  HUMAN: 'HUMAN',
  AI: 'AI'
};

const PieceColor = {
  RED: 'RED',
  BLUE: 'BLUE'
};

const GamePhase = {
  PLACEMENT: 'PLACEMENT',
  MOVEMENT: 'MOVEMENT',
  GAME_OVER: 'GAME_OVER'
};

const GameMode = {
  TWO_PLAYER: 'TWO_PLAYER',
  VS_AI: 'VS_AI'
};

// Board adjacency map (node connections)
const ADJACENCY = {
  0: [1, 3, 4],
  1: [0, 2, 4],
  2: [1, 4, 5],
  3: [0, 4, 6],
  4: [0, 1, 2, 3, 5, 6, 7, 8],
  5: [2, 4, 8],
  6: [3, 4, 7],
  7: [4, 6, 8],
  8: [4, 5, 7]
};

// Winning lines
const WINNING_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
  [0, 4, 8], [2, 4, 6] // Diagonals
];

// Node positions for rendering (normalized 0-1)
const NODE_POSITIONS = [
  { x: 0.15, y: 0.15 }, { x: 0.5, y: 0.15 }, { x: 0.85, y: 0.15 },
  { x: 0.15, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.85, y: 0.5 },
  { x: 0.15, y: 0.85 }, { x: 0.5, y: 0.85 }, { x: 0.85, y: 0.85 }
];

// ===== GAME STATE =====
class GameState {
  constructor({
    board = Array(9).fill(null),
    currentPlayer = PieceColor.RED,
    phase = GamePhase.PLACEMENT,
    piecesPlaced = { RED: 0, BLUE: 0 },
    selectedNode = null,
    winner = null,
    mode = GameMode.TWO_PLAYER,
    playerTypes = { RED: PlayerType.HUMAN, BLUE: PlayerType.HUMAN },
    moveHistory = []
  } = {}) {
    this.board = board;
    this.currentPlayer = currentPlayer;
    this.phase = phase;
    this.piecesPlaced = piecesPlaced;
    this.selectedNode = selectedNode;
    this.winner = winner;
    this.mode = mode;
    this.playerTypes = playerTypes;
    this.moveHistory = moveHistory;
  }

  copy() {
    return new GameState({
      board: [...this.board],
      currentPlayer: this.currentPlayer,
      phase: this.phase,
      piecesPlaced: { ...this.piecesPlaced },
      selectedNode: this.selectedNode,
      winner: this.winner,
      mode: this.mode,
      playerTypes: { ...this.playerTypes },
      moveHistory: [...this.moveHistory]
    });
  }
}

// ===== GAME LOGIC =====
class GameLogic {
  static isValidPlacement(state, nodeIndex) {
    return state.board[nodeIndex] === null && 
           state.phase === GamePhase.PLACEMENT &&
           state.piecesPlaced[state.currentPlayer] < 3;
  }

  static isValidMove(state, from, to) {
    return state.board[from] === state.currentPlayer &&
           state.board[to] === null &&
           ADJACENCY[from].includes(to);
  }

  static checkWinner(board) {
    for (const line of WINNING_LINES) {
      const [a, b, c] = line;
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return board[a];
      }
    }
    return null;
  }

  static placePiece(state, nodeIndex) {
    const newState = state.copy();
    newState.board[nodeIndex] = state.currentPlayer;
    newState.piecesPlaced[state.currentPlayer]++;
    newState.moveHistory.push({ type: 'place', node: nodeIndex, player: state.currentPlayer });

    const winner = this.checkWinner(newState.board);
    if (winner) {
      newState.winner = winner;
      newState.phase = GamePhase.GAME_OVER;
      return newState;
    }

    if (newState.piecesPlaced.RED === 3 && newState.piecesPlaced.BLUE === 3) {
      newState.phase = GamePhase.MOVEMENT;
    }

    newState.currentPlayer = state.currentPlayer === PieceColor.RED ? PieceColor.BLUE : PieceColor.RED;
    return newState;
  }

  static movePiece(state, from, to) {
    const newState = state.copy();
    newState.board[to] = state.currentPlayer;
    newState.board[from] = null;
    newState.selectedNode = null;
    newState.moveHistory.push({ type: 'move', from, to, player: state.currentPlayer });

    const winner = this.checkWinner(newState.board);
    if (winner) {
      newState.winner = winner;
      newState.phase = GamePhase.GAME_OVER;
      return newState;
    }

    newState.currentPlayer = state.currentPlayer === PieceColor.RED ? PieceColor.BLUE : PieceColor.RED;
    return newState;
  }

  static getValidMoves(state, nodeIndex) {
    if (state.board[nodeIndex] !== state.currentPlayer) return [];
    return ADJACENCY[nodeIndex].filter(adj => state.board[adj] === null);
  }

  static getAllValidMoves(state, player) {
    const moves = [];
    state.board.forEach((piece, idx) => {
      if (piece === player) {
        ADJACENCY[idx].forEach(adj => {
          if (state.board[adj] === null) {
            moves.push({ from: idx, to: adj });
          }
        });
      }
    });
    return moves;
  }

  static canPlayerMove(state, player) {
    return this.getAllValidMoves(state, player).length > 0;
  }
}

// ===== AI (MINIMAX) =====
class AI {
  static minimax(state, depth, isMaximizing, alpha, beta, aiColor) {
    const winner = GameLogic.checkWinner(state.board);
    
    if (winner === aiColor) return 100 - depth;
    if (winner !== null) return depth - 100;
    if (depth >= 6) return this.evaluate(state, aiColor);

    const currentColor = isMaximizing ? aiColor : (aiColor === PieceColor.RED ? PieceColor.BLUE : PieceColor.RED);

    if (state.phase === GamePhase.PLACEMENT) {
      if (isMaximizing) {
        let maxEval = -Infinity;
        for (let i = 0; i < 9; i++) {
          if (state.board[i] === null && state.piecesPlaced[currentColor] < 3) {
            const newState = state.copy();
            newState.board[i] = currentColor;
            newState.piecesPlaced[currentColor]++;
            if (newState.piecesPlaced.RED === 3 && newState.piecesPlaced.BLUE === 3) {
              newState.phase = GamePhase.MOVEMENT;
            }
            newState.currentPlayer = aiColor === PieceColor.RED ? PieceColor.BLUE : PieceColor.RED;
            
            const evalScore = this.minimax(newState, depth + 1, false, alpha, beta, aiColor);
            maxEval = Math.max(maxEval, evalScore);
            alpha = Math.max(alpha, evalScore);
            if (beta <= alpha) break;
          }
        }
        return maxEval;
      } else {
        let minEval = Infinity;
        for (let i = 0; i < 9; i++) {
          if (state.board[i] === null && state.piecesPlaced[currentColor] < 3) {
            const newState = state.copy();
            newState.board[i] = currentColor;
            newState.piecesPlaced[currentColor]++;
            if (newState.piecesPlaced.RED === 3 && newState.piecesPlaced.BLUE === 3) {
              newState.phase = GamePhase.MOVEMENT;
            }
            newState.currentPlayer = aiColor;
            
            const evalScore = this.minimax(newState, depth + 1, true, alpha, beta, aiColor);
            minEval = Math.min(minEval, evalScore);
            beta = Math.min(beta, evalScore);
            if (beta <= alpha) break;
          }
        }
        return minEval;
      }
    } else {
      const moves = GameLogic.getAllValidMoves(state, currentColor);
      if (moves.length === 0) return isMaximizing ? -50 : 50;

      if (isMaximizing) {
        let maxEval = -Infinity;
        for (const move of moves) {
          const newState = state.copy();
          newState.board[move.to] = currentColor;
          newState.board[move.from] = null;
          newState.currentPlayer = aiColor === PieceColor.RED ? PieceColor.BLUE : PieceColor.RED;
          
          const evalScore = this.minimax(newState, depth + 1, false, alpha, beta, aiColor);
          maxEval = Math.max(maxEval, evalScore);
          alpha = Math.max(alpha, evalScore);
          if (beta <= alpha) break;
        }
        return maxEval;
      } else {
        let minEval = Infinity;
        for (const move of moves) {
          const newState = state.copy();
          newState.board[move.to] = currentColor;
          newState.board[move.from] = null;
          newState.currentPlayer = aiColor;
          
          const evalScore = this.minimax(newState, depth + 1, true, alpha, beta, aiColor);
          minEval = Math.min(minEval, evalScore);
          beta = Math.min(beta, evalScore);
          if (beta <= alpha) break;
        }
        return minEval;
      }
    }
  }

  static evaluate(state, aiColor) {
    const opponentColor = aiColor === PieceColor.RED ? PieceColor.BLUE : PieceColor.RED;
    let score = 0;

    for (const line of WINNING_LINES) {
      const [a, b, c] = line;
      const pieces = [state.board[a], state.board[b], state.board[c]];
      const aiCount = pieces.filter(p => p === aiColor).length;
      const opCount = pieces.filter(p => p === opponentColor).length;

      if (aiCount === 2 && opCount === 0) score += 10;
      if (opCount === 2 && aiCount === 0) score -= 10;
      if (aiCount === 1 && opCount === 0) score += 2;
      if (opCount === 1 && aiCount === 0) score -= 2;
    }

    return score;
  }

  static getBestMove(state) {
    const aiColor = state.currentPlayer;
    
    if (state.phase === GamePhase.PLACEMENT) {
      let bestScore = -Infinity;
      let bestMove = null;

      for (let i = 0; i < 9; i++) {
        if (state.board[i] === null && state.piecesPlaced[aiColor] < 3) {
          const newState = state.copy();
          newState.board[i] = aiColor;
          newState.piecesPlaced[aiColor]++;
          if (newState.piecesPlaced.RED === 3 && newState.piecesPlaced.BLUE === 3) {
            newState.phase = GamePhase.MOVEMENT;
          }
          newState.currentPlayer = aiColor === PieceColor.RED ? PieceColor.BLUE : PieceColor.RED;

          const score = this.minimax(newState, 0, false, -Infinity, Infinity, aiColor);
          if (score > bestScore) {
            bestScore = score;
            bestMove = i;
          }
        }
      }
      return { type: 'place', node: bestMove };
    } else {
      let bestScore = -Infinity;
      let bestMove = null;
      const moves = GameLogic.getAllValidMoves(state, aiColor);

      for (const move of moves) {
        const newState = state.copy();
        newState.board[move.to] = aiColor;
        newState.board[move.from] = null;
        newState.currentPlayer = aiColor === PieceColor.RED ? PieceColor.BLUE : PieceColor.RED;

        const score = this.minimax(newState, 0, false, -Infinity, Infinity, aiColor);
        if (score > bestScore) {
          bestScore = score;
          bestMove = move;
        }
      }
      return { type: 'move', ...bestMove };
    }
  }
}

// ===== BOARD RENDERER =====
const GameBoard = ({ state, onNodeClick, validMoves = [] }) => {
  const canvasRef = React.useRef(null);
  const [dimensions, setDimensions] = useState({ width: 400, height: 400 });

  useEffect(() => {
    const updateDimensions = () => {
      const size = Math.min(window.innerWidth - 40, 500);
      setDimensions({ width: size, height: size });
    };
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const { width, height } = dimensions;
    
    ctx.clearRect(0, 0, width, height);

    // Draw connections
    ctx.strokeStyle = '#4a5568';
    ctx.lineWidth = 2;
    
    Object.entries(ADJACENCY).forEach(([node, adjacents]) => {
      const nodeIdx = parseInt(node);
      const startPos = NODE_POSITIONS[nodeIdx];
      
      adjacents.forEach(adj => {
        if (adj > nodeIdx) {
          const endPos = NODE_POSITIONS[adj];
          ctx.beginPath();
          ctx.moveTo(startPos.x * width, startPos.y * height);
          ctx.lineTo(endPos.x * width, endPos.y * height);
          ctx.stroke();
        }
      });
    });

    // Draw nodes
    NODE_POSITIONS.forEach((pos, idx) => {
      const x = pos.x * width;
      const y = pos.y * height;
      const isValid = validMoves.includes(idx);
      const isSelected = state.selectedNode === idx;

      // Node background
      ctx.beginPath();
      ctx.arc(x, y, isSelected ? 22 : 18, 0, Math.PI * 2);
      ctx.fillStyle = isValid ? '#fbbf24' : '#e5e7eb';
      ctx.fill();
      ctx.strokeStyle = isSelected ? '#3b82f6' : '#9ca3af';
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.stroke();

      // Draw piece
      if (state.board[idx]) {
        ctx.beginPath();
        ctx.arc(x, y, 12, 0, Math.PI * 2);
        ctx.fillStyle = state.board[idx] === PieceColor.RED ? '#ef4444' : '#3b82f6';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });
  }, [state, dimensions, validMoves]);

  const handleCanvasClick = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width);
    const y = ((e.clientY - rect.top) / rect.height);

    // Find closest node
    let closestNode = 0;
    let minDist = Infinity;

    NODE_POSITIONS.forEach((pos, idx) => {
      const dist = Math.sqrt((pos.x - x) ** 2 + (pos.y - y) ** 2);
      if (dist < minDist) {
        minDist = dist;
        closestNode = idx;
      }
    });

    if (minDist < 0.08) {
      onNodeClick(closestNode);
    }
  };

  return (
    <canvas
      ref={canvasRef}
      width={dimensions.width}
      height={dimensions.height}
      onClick={handleCanvasClick}
      className="cursor-pointer border-2 border-gray-300 rounded-lg shadow-lg bg-white"
      style={{ touchAction: 'none' }}
    />
  );
};

// ===== MAIN GAME COMPONENT =====
// ===== MAIN GAME COMPONENT =====
const TegoGame = () => {
  const [gameState, setGameState] = useState(null);
  const [validMoves, setValidMoves] = useState([]);
  // State to toggle the AI options in the menu
  const [showAiOptions, setShowAiOptions] = useState(false);

  // Updated startGame to accept aiStarts parameter
  const startGame = (mode, aiStarts = false) => {
    let playerTypes;

    if (mode === GameMode.VS_AI) {
      // If AI starts, AI gets RED (Player 1), Human gets BLUE (Player 2)
      // If Human starts, Human gets RED, AI gets BLUE
      playerTypes = aiStarts 
        ? { RED: PlayerType.AI, BLUE: PlayerType.HUMAN }
        : { RED: PlayerType.HUMAN, BLUE: PlayerType.AI };
    } else {
      playerTypes = { RED: PlayerType.HUMAN, BLUE: PlayerType.HUMAN };
    }

    setGameState(new GameState({ mode, playerTypes }));
    setValidMoves([]);
    setShowAiOptions(false); // Reset menu state
  };

  const handleNodeClick = useCallback((nodeIndex) => {
    if (!gameState || gameState.phase === GamePhase.GAME_OVER) return;
    
    // Check strict equality against AI to prevent moving for the computer
    if (gameState.playerTypes[gameState.currentPlayer] === PlayerType.AI) return;

    if (gameState.phase === GamePhase.PLACEMENT) {
      if (GameLogic.isValidPlacement(gameState, nodeIndex)) {
        const newState = GameLogic.placePiece(gameState, nodeIndex);
        setGameState(newState);
        setValidMoves([]);
      }
    } else {
      if (gameState.selectedNode === null) {
        if (gameState.board[nodeIndex] === gameState.currentPlayer) {
          const moves = GameLogic.getValidMoves(gameState, nodeIndex);
          const newState = gameState.copy();
          newState.selectedNode = nodeIndex;
          setGameState(newState);
          setValidMoves(moves);
        }
      } else {
        if (validMoves.includes(nodeIndex)) {
          const newState = GameLogic.movePiece(gameState, gameState.selectedNode, nodeIndex);
          setGameState(newState);
          setValidMoves([]);
        } else if (gameState.board[nodeIndex] === gameState.currentPlayer) {
          const moves = GameLogic.getValidMoves(gameState, nodeIndex);
          const newState = gameState.copy();
          newState.selectedNode = nodeIndex;
          setGameState(newState);
          setValidMoves(moves);
        } else {
          const newState = gameState.copy();
          newState.selectedNode = null;
          setGameState(newState);
          setValidMoves([]);
        }
      }
    }
  }, [gameState, validMoves]);

  const resetGame = () => {
    setGameState(null);
    setValidMoves([]);
  };

  const undoMove = () => {
    if (!gameState || gameState.moveHistory.length === 0) return;
    
    // When undoing against AI, we usually want to undo TWO moves (AI's and Player's)
    // to get back to the Player's turn.
    let stepsToUndo = 1;
    if (gameState.mode === GameMode.VS_AI) {
        // If the current player is AI, we just undo the previous Human move (1 step)
        // If the current player is Human, we undo AI move AND Human move (2 steps)
        // However, simple approach: Just undo 1 step at a time.
        // User can click twice if they want to redo their turn.
        stepsToUndo = 1;
    }

    const newState = new GameState({
      mode: gameState.mode,
      playerTypes: gameState.playerTypes
    });
    
    const historyToReplay = gameState.moveHistory.slice(0, -stepsToUndo);
    let tempState = newState;
    
    historyToReplay.forEach(move => {
      if (move.type === 'place') {
        tempState = GameLogic.placePiece(tempState, move.node);
      } else {
        const selectState = tempState.copy();
        selectState.selectedNode = move.from;
        tempState = GameLogic.movePiece(selectState, move.from, move.to);
      }
    });
    
    setGameState(tempState);
    setValidMoves([]);
  };

  useEffect(() => {
    if (!gameState || gameState.phase === GamePhase.GAME_OVER) return;
    
    // Check if it is currently the AI's turn
    if (gameState.playerTypes[gameState.currentPlayer] === PlayerType.AI) {
      const timer = setTimeout(() => {
        const move = AI.getBestMove(gameState);
        
        if (move.type === 'place') {
          const newState = GameLogic.placePiece(gameState, move.node);
          setGameState(newState);
        } else {
          const selectState = gameState.copy();
          selectState.selectedNode = move.from;
          const newState = GameLogic.movePiece(selectState, move.from, move.to);
          setGameState(newState);
        }
      }, 500); // 500ms delay for natural feel

      return () => clearTimeout(timer);
    }
  }, [gameState]);

  if (!gameState) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-800 mb-2">Tego</h1>
            <p className="text-gray-600">Three Men's Morris</p>
          </div>
          
          <div className="space-y-4">
            {/* Two Player Button */}
            <button
              onClick={() => startGame(GameMode.TWO_PLAYER)}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-4 px-6 rounded-lg flex items-center justify-center gap-3 transition-colors"
            >
              <Users size={24} />
              Two Players
            </button>
            
            {/* VS AI Section */}
            {!showAiOptions ? (
               <button
               onClick={() => setShowAiOptions(true)}
               className="w-full bg-purple-500 hover:bg-purple-600 text-white font-semibold py-4 px-6 rounded-lg flex items-center justify-center gap-3 transition-colors"
             >
               <Cpu size={24} />
               vs AI
             </button>
            ) : (
              <div className="bg-purple-50 p-4 rounded-lg border-2 border-purple-100 animate-in fade-in slide-in-from-top-2">
                <p className="text-center text-purple-800 font-semibold mb-3">Who goes first?</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => startGame(GameMode.VS_AI, false)}
                    className="bg-purple-500 hover:bg-purple-600 text-white p-3 rounded-lg text-sm font-medium transition-colors"
                  >
                    Play First
                    <span className="block text-xs opacity-75">(Red)</span>
                  </button>
                  <button
                    onClick={() => startGame(GameMode.VS_AI, true)}
                    className="bg-purple-700 hover:bg-purple-800 text-white p-3 rounded-lg text-sm font-medium transition-colors"
                  >
                    AI First
                    <span className="block text-xs opacity-75">(Blue)</span>
                  </button>
                </div>
                <button 
                  onClick={() => setShowAiOptions(false)}
                  className="w-full mt-2 text-xs text-gray-500 hover:text-gray-700 py-1"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
          
          <div className="mt-8 p-4 bg-gray-50 rounded-lg text-sm text-gray-700">
            <h3 className="font-semibold mb-2">How to Play:</h3>
            <ul className="space-y-1 list-disc list-inside">
              <li>Each player has 3 pieces</li>
              <li>Place all pieces, then move them</li>
              <li>Move to adjacent nodes only</li>
              <li>Win by making 3 in a row</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  // ... (Rest of the Render logic remains identical) ...

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-2xl w-full">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Tego</h1>
            <p className="text-sm text-gray-600">
              {gameState.mode === GameMode.VS_AI ? 'vs AI' : 'Two Players'}
            </p>
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={undoMove}
              disabled={gameState.moveHistory.length === 0}
              className="p-2 bg-gray-200 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
              title="Undo"
            >
              <RotateCcw size={20} />
            </button>
            <button
              onClick={resetGame}
              className="p-2 bg-gray-200 hover:bg-gray-300 rounded-lg transition-colors"
              title="Menu"
            >
              <Home size={20} />
            </button>
          </div>
        </div>

        {gameState.phase !== GamePhase.GAME_OVER && (
          <div className="mb-4 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-6 h-6 rounded-full ${gameState.currentPlayer === PieceColor.RED ? 'bg-red-500' : 'bg-blue-500'}`} />
                <span className="font-semibold text-gray-800">
                  {gameState.currentPlayer === PieceColor.RED ? 'Red' : 'Blue'} Player
                  {gameState.playerTypes[gameState.currentPlayer] === PlayerType.AI && ' (AI)'}
                </span>
              </div>
              <span className="text-sm text-gray-600">
                {gameState.phase === GamePhase.PLACEMENT 
                  ? `Placing (${gameState.piecesPlaced[gameState.currentPlayer]}/3)`
                  : 'Moving'}
              </span>
            </div>
          </div>
        )}

        {gameState.phase === GamePhase.GAME_OVER && (
          <div className="mb-4 p-4 bg-green-100 border-2 border-green-400 rounded-lg">
            <div className="flex items-center justify-center gap-3">
              <div className={`w-8 h-8 rounded-full ${gameState.winner === PieceColor.RED ? 'bg-red-500' : 'bg-blue-500'}`} />
              <span className="text-xl font-bold text-gray-800">
                {gameState.winner === PieceColor.RED ? 'Red' : 'Blue'} Wins!
              </span>
            </div>
          </div>
        )}

        <div className="flex justify-center mb-4">
          <GameBoard 
            state={gameState} 
            onNodeClick={handleNodeClick}
            validMoves={validMoves}
          />
        </div>

        <div className="grid grid-cols-2 gap-4 text-center text-sm">
          <div className="p-3 bg-red-50 rounded-lg">
            <div className="flex items-center justify-center gap-2 mb-1">
              <div className="w-4 h-4 rounded-full bg-red-500" />
              <span className="font-semibold">Red</span>
            </div>
            <span className="text-gray-600">
              {gameState.piecesPlaced.RED}/3 placed
            </span>
          </div>
          
          <div className="p-3 bg-blue-50 rounded-lg">
            <div className="flex items-center justify-center gap-2 mb-1">
              <div className="w-4 h-4 rounded-full bg-blue-500" />
              <span className="font-semibold">Blue</span>
            </div>
            <span className="text-gray-600">
              {gameState.piecesPlaced.BLUE}/3 placed
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TegoGame;