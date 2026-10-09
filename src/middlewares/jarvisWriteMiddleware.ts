/* ============================================================
 *  WRITE ROUTES — approve / reject (require JARVIS_ALLOW_WRITE)
 * ============================================================ */

router.post(
  "/deposits/:uid/:depositId/approve",
  requireJarvisWrite,
  async (req: Request, res: Response) => {
    try {
      const depositId = Number(req.params.depositId);
      const user = await User.findOne({ firebaseUid: req.params.uid });
      if (!user) return res.status(404).json({ success: false, message: "User not found" });

      const deposit: any = (user.deposits || []).find(
        (d: any) => Number(d.id) === depositId
      );
      if (!deposit) return res.status(404).json({ success: false, message: "Deposit not found" });
      if (deposit.status === "Approved")
        return res.status(400).json({ success: false, message: "Deposit already approved" });
      if (deposit.status === "Rejected")
        return res.status(400).json({ success: false, message: "Deposit was rejected" });

      const amt = Number(deposit.amount || 0);
      deposit.status = "Approved";
      user.markModified("deposits");

      const wallets: any = user.wallets || {};
      wallets.usdt = Number(wallets.usdt || 0) + amt;
      user.wallets = wallets;
      user.markModified("wallets");
      user.balance = Number(user.balance || 0) + amt;

      await user.save();

      return res.json({
        success: true,
        message: `Deposit approved. $${amt.toFixed(2)} credited as USDT.`,
        amount: amt,
        userEmail: user.email,
      });
    } catch (err: any) {
      console.error("JARVIS approve deposit error:", err);
      return res.status(500).json({ success: false, message: "Approval failed" });
    }
  }
);

router.post(
  "/deposits/:uid/:depositId/reject",
  requireJarvisWrite,
  async (req: Request, res: Response) => {
    try {
      const depositId = Number(req.params.depositId);
      const user = await User.findOne({ firebaseUid: req.params.uid });
      if (!user) return res.status(404).json({ success: false, message: "User not found" });

      const deposit: any = (user.deposits || []).find(
        (d: any) => Number(d.id) === depositId
      );
      if (!deposit) return res.status(404).json({ success: false, message: "Deposit not found" });
      if (deposit.status === "Rejected")
        return res.status(400).json({ success: false, message: "Already rejected" });
      if (deposit.status === "Approved")
        return res.status(400).json({ success: false, message: "Was approved" });

      const amt = Number(deposit.amount || 0);
      deposit.status = "Rejected";
      user.markModified("deposits");
      await user.save();

      return res.json({
        success: true,
        message: `Deposit rejected.`,
        amount: amt,
        userEmail: user.email,
      });
    } catch (err: any) {
      console.error("JARVIS reject deposit error:", err);
      return res.status(500).json({ success: false, message: "Reject failed" });
    }
  }
);

router.post(
  "/withdrawals/:uid/:withdrawalId/approve",
  requireJarvisWrite,
  async (req: Request, res: Response) => {
    try {
      const wid = Number(req.params.withdrawalId);
      const user = await User.findOne({ firebaseUid: req.params.uid });
      if (!user) return res.status(404).json({ success: false, message: "User not found" });

      const w: any = (user.withdrawals || []).find(
        (x: any) => Number(x.id) === wid
      );
      if (!w) return res.status(404).json({ success: false, message: "Withdrawal not found" });
      if (w.status === "Approved")
        return res.status(400).json({ success: false, message: "Already approved" });
      if (w.status === "Rejected")
        return res.status(400).json({ success: false, message: "Was rejected" });

      w.status = "Approved";
      user.markModified("withdrawals");
      await user.save();

      return res.json({
        success: true,
        message: `Withdrawal approved.`,
        amount: Number(w.amount || 0),
        userEmail: user.email,
      });
    } catch (err: any) {
      console.error("JARVIS approve withdrawal error:", err);
      return res.status(500).json({ success: false, message: "Approval failed" });
    }
  }
);

router.post(
  "/withdrawals/:uid/:withdrawalId/reject",
  requireJarvisWrite,
  async (req: Request, res: Response) => {
    try {
      const wid = Number(req.params.withdrawalId);
      const user = await User.findOne({ firebaseUid: req.params.uid });
      if (!user) return res.status(404).json({ success: false, message: "User not found" });

      const w: any = (user.withdrawals || []).find(
        (x: any) => Number(x.id) === wid
      );
      if (!w) return res.status(404).json({ success: false, message: "Withdrawal not found" });
      if (w.status === "Rejected")
        return res.status(400).json({ success: false, message: "Already rejected" });
      if (w.status === "Approved")
        return res.status(400).json({ success: false, message: "Was approved" });

      const refundAmount = Number(w.amount || 0);
      w.status = "Rejected";
      user.markModified("withdrawals");

      const wallets: any = user.wallets || {};
      wallets.usdt = Number(wallets.usdt || 0) + refundAmount;
      user.wallets = wallets;
      user.markModified("wallets");
      user.balance = Number(user.balance || 0) + refundAmount;

      await user.save();

      return res.json({
        success: true,
        message: `Withdrawal rejected. $${refundAmount.toFixed(2)} refunded.`,
        amount: refundAmount,
        userEmail: user.email,
      });
    } catch (err: any) {
      console.error("JARVIS reject withdrawal error:", err);
      return res.status(500).json({ success: false, message: "Reject failed" });
    }
  }
);
